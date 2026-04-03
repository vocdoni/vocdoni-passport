/**
 * JNI bridge for barretenberg prover/verifier.
 * SAFETY: catches C++ exceptions and converts to Java exceptions.
 */
#include <jni.h>
#include <android/log.h>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <string>
#include <mutex>
#include <algorithm>
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/polynomials/backing_memory.hpp"

#define LOG_TAG "BarretenbergJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

extern "C" void bbapi(const uint8_t* input_in, size_t input_len_in,
                       uint8_t** output_out, size_t* output_len_out);

namespace {
std::once_flag g_runtime_config_once;
constexpr uint64_t ONE_GIB = 1024ULL * 1024ULL * 1024ULL;

void configure_runtime_profile(uint64_t total_mem_bytes, int cpu_count)
{
    const uint64_t effective_mem = total_mem_bytes > 0 ? total_mem_bytes : ONE_GIB;
    const int effective_cpus = std::max(cpu_count, 1);
    const bool low_memory = effective_mem < (2ULL * ONE_GIB);

    int worker_threads = 1;
    const char* storage_budget_str = "16m";
    bool slow_low_memory = true;
    const char* profile = "low-memory";

    if (!low_memory) {
        slow_low_memory = false;
        if (effective_mem >= (6ULL * ONE_GIB)) {
            worker_threads = std::min(effective_cpus, 4);
            storage_budget_str = "192m";
            profile = "high-throughput";
        } else if (effective_mem >= (4ULL * ONE_GIB)) {
            worker_threads = std::min(effective_cpus, 3);
            storage_budget_str = "128m";
            profile = "balanced-plus";
        } else {
            worker_threads = std::min(effective_cpus, 2);
            storage_budget_str = "64m";
            profile = "balanced";
        }
    }

    const std::string worker_threads_str = std::to_string(worker_threads);
    setenv("HARDWARE_CONCURRENCY", worker_threads_str.c_str(), 1);
    setenv("BB_SLOW_LOW_MEMORY", slow_low_memory ? "1" : "0", 1);
    setenv("BB_STORAGE_BUDGET", storage_budget_str, 1);
    storage_budget = parse_size_string(storage_budget_str);
    set_slow_low_memory(slow_low_memory);

    LOGI("Configured barretenberg runtime: profile=%s total_mem_mib=%llu cpu_count=%d threads=%d slow=%d storage_budget=%s parsed_budget=%zu",
         profile,
         static_cast<unsigned long long>(effective_mem / (1024ULL * 1024ULL)),
         effective_cpus,
         worker_threads,
         slow_low_memory ? 1 : 0,
         storage_budget_str,
         storage_budget);
}

void ensure_runtime_configured()
{
    std::call_once(g_runtime_config_once, []() { configure_runtime_profile(0, 1); });
}

void ensure_crs_for_bbapi_call()
{
    ensure_runtime_configured();
    auto crs_path = bb::srs::bb_crs_path();
    LOGI("CRS init before bbapi from path: %s", crs_path.c_str());
    bb::srs::init_file_crs_factory(crs_path);
}
}

extern "C" {

JNIEXPORT void JNICALL
Java_com_vocdonipassport_barretenberg_BarretenbergModule_nativeConfigureRuntime(
    JNIEnv*, jobject, jlong total_mem_bytes, jint cpu_count) {
    std::call_once(g_runtime_config_once, [&]() {
        configure_runtime_profile(static_cast<uint64_t>(std::max<jlong>(0, total_mem_bytes)),
                                  static_cast<int>(cpu_count));
    });
}

JNIEXPORT void JNICALL
Java_com_vocdonipassport_barretenberg_BarretenbergModule_nativeSetCrsPath(
    JNIEnv* env, jobject, jstring path) {
    const char* crsPath = env->GetStringUTFChars(path, nullptr);
    setenv("CRS_PATH", crsPath, 1);
    // Use app-private storage for any file-backed polynomial temp files.
    setenv("TMPDIR", crsPath, 1);
    LOGI("CRS_PATH set to: %s", crsPath);
    LOGI("TMPDIR set to: %s", crsPath);
    try {
        ensure_crs_for_bbapi_call();
    } catch (const std::exception& e) {
        LOGE("CRS init failed after setting path: %s", e.what());
    } catch (...) {
        LOGE("CRS init failed after setting path: unknown exception");
    }
    env->ReleaseStringUTFChars(path, crsPath);
}

JNIEXPORT jbyteArray JNICALL
Java_com_vocdonipassport_barretenberg_BarretenbergModule_nativeBbapi(
    JNIEnv* env, jobject, jbyteArray input) {

    if (!input) {
        env->ThrowNew(env->FindClass("java/lang/IllegalArgumentException"), "null input");
        return nullptr;
    }
    jsize input_len = env->GetArrayLength(input);
    if (input_len <= 0) {
        env->ThrowNew(env->FindClass("java/lang/IllegalArgumentException"), "empty input");
        return nullptr;
    }
    jbyte* input_data = env->GetByteArrayElements(input, nullptr);
    if (!input_data) {
        env->ThrowNew(env->FindClass("java/lang/RuntimeException"), "failed to get input bytes");
        return nullptr;
    }

    LOGI("bbapi call: %d bytes input", input_len);

    uint8_t* output = nullptr;
    size_t output_len = 0;
    std::string error_msg;

    try {
        ensure_crs_for_bbapi_call();
        LOGI("bbapi entering native prover");
        bbapi(reinterpret_cast<const uint8_t*>(input_data),
              static_cast<size_t>(input_len), &output, &output_len);
        LOGI("bbapi native prover returned, output=%p len=%zu", output, output_len);
    } catch (const std::exception& e) {
        error_msg = e.what() ? e.what() : "std::exception with null what()";
        LOGE("bbapi std::exception: %s", error_msg.c_str());
    } catch (...) {
        error_msg = "unknown C++ exception";
        LOGE("bbapi unknown exception");
    }

    env->ReleaseByteArrayElements(input, input_data, JNI_ABORT);

    if (!error_msg.empty()) {
        if (output) free(output);
        char buf[1024];
        snprintf(buf, sizeof(buf), "%.1023s", error_msg.c_str());
        LOGE("Throwing Java RuntimeException: %s", buf);
        env->ThrowNew(env->FindClass("java/lang/RuntimeException"), buf);
        return nullptr;
    }
    if (!output || output_len == 0) {
        LOGE("bbapi returned empty output pointer=%p len=%zu", output, output_len);
        env->ThrowNew(env->FindClass("java/lang/RuntimeException"), "bbapi returned empty output");
        return nullptr;
    }

    LOGI("bbapi result: %zu bytes output", output_len);
    jbyteArray result = env->NewByteArray(static_cast<jsize>(output_len));
    if (result) {
        env->SetByteArrayRegion(result, 0, static_cast<jsize>(output_len),
                                reinterpret_cast<const jbyte*>(output));
    }
    free(output);
    return result;
}

} // extern "C"
