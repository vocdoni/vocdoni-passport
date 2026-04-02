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
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/polynomials/backing_memory.hpp"

#define LOG_TAG "BarretenbergJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

extern "C" void bbapi(const uint8_t* input_in, size_t input_len_in,
                       uint8_t** output_out, size_t* output_len_out);

namespace {
std::once_flag g_configure_low_memory_once;

void configure_low_memory_runtime()
{
    // Force barretenberg to use a single worker and its low-memory backing mode.
    // Important: some older barretenberg globals are initialized at library load,
    // so we set both env vars and the live globals/functions here.
    setenv("HARDWARE_CONCURRENCY", "1", 1);
    setenv("BB_SLOW_LOW_MEMORY", "1", 1);
    setenv("BB_STORAGE_BUDGET", "16m", 1);
    storage_budget = parse_size_string("16m");
    set_slow_low_memory(true);
    LOGI("Configured low-memory runtime: HARDWARE_CONCURRENCY=1 BB_SLOW_LOW_MEMORY=1 BB_STORAGE_BUDGET=16m storage_budget=%zu slow=%d",
         storage_budget,
         is_slow_low_memory_enabled() ? 1 : 0);
}

void ensure_crs_for_bbapi_call()
{
    std::call_once(g_configure_low_memory_once, configure_low_memory_runtime);
    auto crs_path = bb::srs::bb_crs_path();
    LOGI("CRS init before bbapi from path: %s", crs_path.c_str());
    bb::srs::init_file_crs_factory(crs_path);
}
}

extern "C" {

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
