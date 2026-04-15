cmake_minimum_required(VERSION 3.22)
project(barretenberg_jni CXX C)

set(CMAKE_CXX_STANDARD 20)

# Path to the prebuilt barretenberg static library.
# Set BB_ROOT explicitly when using this CMake path directly.
if(DEFINED ENV{BB_ROOT})
    set(BB_ROOT "$ENV{BB_ROOT}")
else()
    message(FATAL_ERROR "BB_ROOT must point to a prepared barretenberg/cpp tree")
endif()

# Determine architecture-specific build directory
if(ANDROID_ABI STREQUAL "arm64-v8a")
    set(BB_BUILD_DIR "${BB_ROOT}/build-android-arm64")
elseif(ANDROID_ABI STREQUAL "x86_64")
    set(BB_BUILD_DIR "${BB_ROOT}/build-android-x86_64")
else()
    message(FATAL_ERROR "Unsupported ABI: ${ANDROID_ABI}")
endif()

message(STATUS "BB_ROOT: ${BB_ROOT}")
message(STATUS "BB_BUILD_DIR: ${BB_BUILD_DIR}")

# Import prebuilt static libraries
add_library(barretenberg STATIC IMPORTED)
set_target_properties(barretenberg PROPERTIES IMPORTED_LOCATION "${BB_BUILD_DIR}/lib/libbarretenberg.a")

add_library(bb_env STATIC IMPORTED)
set_target_properties(bb_env PROPERTIES IMPORTED_LOCATION "${BB_BUILD_DIR}/lib/libenv.a")

add_library(bb_deflate STATIC IMPORTED)
set_target_properties(bb_deflate PROPERTIES IMPORTED_LOCATION "${BB_BUILD_DIR}/_deps/libdeflate-build/libdeflate.a")

# Build the JNI shared library
add_library(barretenberg_jni SHARED
    barretenberg_jni.cpp
    lmdb_stubs.c
    env_stubs.c
)

target_include_directories(barretenberg_jni PRIVATE
    "${BB_ROOT}/src"
    "${BB_BUILD_DIR}/_deps/msgpack-c/src/msgpack-c/include"
    "${BB_BUILD_DIR}/_deps/tracy-src/public"
    "${BB_BUILD_DIR}/_deps/libdeflate-src"
)

target_compile_options(barretenberg_jni PRIVATE
    $<$<COMPILE_LANGUAGE:CXX>:-fconstexpr-steps=100000000 -fbracket-depth=1024>
)

# Link: use --start-group to resolve circular deps between static archives
target_link_libraries(barretenberg_jni
    -Wl,--start-group
    barretenberg
    bb_env
    bb_deflate
    -Wl,--end-group
    log  # Android logging
)

# 16 KB page size support (required for Google Play targeting Android 15+)
# NDK r27 does not enable this by default; r28+ does.
target_link_options(barretenberg_jni PRIVATE "-Wl,-z,max-page-size=16384")
