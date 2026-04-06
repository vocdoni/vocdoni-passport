# syntax=docker/dockerfile:1.7
#
# Vocdoni Passport - Android Build Dockerfile
#
# This Dockerfile builds the Android APK/AAB with all native dependencies:
#   - Barretenberg JNI library for zero-knowledge proof generation
#   - ACVM Witness JNI library for circuit witness solving
#
# The build is fully self-contained and reproducible.
#
# Usage:
#   docker build -f docker/apk.Dockerfile -t vocdoni-passport-android .
#   docker create --name extract vocdoni-passport-android
#   docker cp extract:/out/app-release.apk ./
#   docker rm extract
#
# Build arguments:
#   AZTEC_PACKAGES_REF  - Git commit of zkPassport's Aztec fork (default: pinned)
#   GRADLE_TASK         - Gradle task to run (default: assembleRelease)
#   GRADLE_EXTRA_ARGS   - Additional Gradle arguments
#
# Copyright (c) 2024 Vocdoni Association
# SPDX-License-Identifier: AGPL-3.0-or-later

# =============================================================================
# Base Image
# =============================================================================

FROM reactnativecommunity/react-native-android:latest

# Build arguments
ARG AZTEC_PACKAGES_REF=a4f7c39e15e7835c1f5f491168afa4aaac286894
ARG GRADLE_TASK=assembleRelease
ARG GRADLE_TASKS=
ARG GRADLE_EXTRA_ARGS=
ARG RUST_VERSION=1.89
ARG ANDROID_VERSION_NAME=1.0
ARG ANDROID_VERSION_CODE=1

# =============================================================================
# System Dependencies
# =============================================================================

USER root

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        clang \
        curl \
        git \
        lld \
        ninja-build \
    && rm -rf /var/lib/apt/lists/*

# Android NDK path
ENV ANDROID_NDK_HOME=${ANDROID_HOME}/ndk/27.1.12297006

# =============================================================================
# Rust Toolchain
# =============================================================================

RUN curl -sSf https://sh.rustup.rs | sh -s -- -y \
        --default-toolchain ${RUST_VERSION} \
        --profile minimal && \
    . "$HOME/.cargo/env" && \
    rustup target add aarch64-linux-android x86_64-linux-android

ENV PATH="/root/.cargo/bin:${PATH}"

# =============================================================================
# Barretenberg Build
# =============================================================================

WORKDIR /tmp/bb

# Clone zkPassport's Aztec fork
RUN git clone --depth 1 https://github.com/zkpassport/aztec-packages /tmp/aztec-packages && \
    cd /tmp/aztec-packages && \
    git fetch --depth 1 origin ${AZTEC_PACKAGES_REF} && \
    git checkout ${AZTEC_PACKAGES_REF}

# Copy Barretenberg source
RUN cp /tmp/aztec-packages/barretenberg/cpp/CMakeLists.txt ./ && \
    cp /tmp/aztec-packages/barretenberg/cpp/CMakePresets.json ./ && \
    cp -R /tmp/aztec-packages/barretenberg/cpp/cmake ./cmake && \
    cp -R /tmp/aztec-packages/barretenberg/cpp/src ./src

# Apply Android-specific patches
COPY docker/barretenberg-android-overlay/ /tmp/bb/

# Fix LMDB build for Android
RUN perl -0pi -e 's{BUILD_COMMAND make -C libraries/liblmdb -e XCFLAGS=-fPIC liblmdb\\.a}{BUILD_COMMAND sh -lc "make -C libraries/liblmdb -e XCFLAGS=-fPIC liblmdb.a || true"}g' \
    /tmp/bb/cmake/lmdb.cmake

# Fix memory allocation for Android
RUN sed -i '/barretenberg\/common\/net.hpp/a #include "barretenberg/common/mem.hpp"' \
        /tmp/bb/src/barretenberg/common/serialize.hpp && \
    sed -i 's|reinterpret_cast<uint8_t\\*>(aligned_alloc(64, heap_buf_size_aligned))|reinterpret_cast<uint8_t*>(bb::aligned_alloc(64, heap_buf_size_aligned))|g' \
        /tmp/bb/src/barretenberg/common/serialize.hpp

# Build for ARM64
RUN cmake -B build-android-arm64 -G Ninja \
        -DCMAKE_TOOLCHAIN_FILE=$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake \
        -DANDROID_ABI=arm64-v8a \
        -DANDROID_PLATFORM=android-26 \
        -DCMAKE_BUILD_TYPE=Release \
        -DDISABLE_AZTEC_VM=ON \
        -DMULTITHREADING=ON && \
    ninja -C build-android-arm64 barretenberg env libdeflate_static

# Build for x86_64 (emulator support)
RUN cmake -B build-android-x86_64 -G Ninja \
        -DCMAKE_TOOLCHAIN_FILE=$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake \
        -DANDROID_ABI=x86_64 \
        -DANDROID_PLATFORM=android-26 \
        -DCMAKE_BUILD_TYPE=Release \
        -DDISABLE_AZTEC_VM=ON \
        -DMULTITHREADING=ON && \
    ninja -C build-android-x86_64 barretenberg env libdeflate_static

# =============================================================================
# Barretenberg JNI Library
# =============================================================================

COPY android/app/src/main/cpp/ /tmp/jni/

# Build JNI wrapper for ARM64
RUN cd /tmp/jni && \
    $ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/clang++ \
        --target=aarch64-none-linux-android26 \
        --sysroot=$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/sysroot \
        -shared -fPIC -O2 -std=c++20 \
        -fconstexpr-steps=100000000 -fbracket-depth=1024 \
        -DANDROID -DDISABLE_ASM=1 -DDISABLE_AZTEC_VM=1 -DNO_PAR_ALGOS \
        -I/tmp/bb/src \
        -I/tmp/bb/build-android-arm64/_deps/msgpack-c/src/msgpack-c/include \
        -I/tmp/bb/build-android-arm64/_deps/tracy-src/public \
        -I/tmp/bb/build-android-arm64/_deps/libdeflate-src \
        barretenberg_jni.cpp lmdb_stubs.c env_stubs.c \
        -Wl,--start-group \
        /tmp/bb/build-android-arm64/lib/libbarretenberg.a \
        /tmp/bb/build-android-arm64/lib/libenv.a \
        /tmp/bb/build-android-arm64/_deps/libdeflate-build/libdeflate.a \
        -Wl,--end-group \
        -llog -lc++ \
        -o /tmp/jni/libbarretenberg_jni_arm64.so

# Build JNI wrapper for x86_64
RUN cd /tmp/jni && \
    $ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/clang++ \
        --target=x86_64-none-linux-android26 \
        --sysroot=$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/sysroot \
        -shared -fPIC -O2 -std=c++20 \
        -fconstexpr-steps=100000000 -fbracket-depth=1024 \
        -DANDROID -DDISABLE_AZTEC_VM=1 -DNO_PAR_ALGOS \
        -I/tmp/bb/src \
        -I/tmp/bb/build-android-x86_64/_deps/msgpack-c/src/msgpack-c/include \
        -I/tmp/bb/build-android-x86_64/_deps/tracy-src/public \
        -I/tmp/bb/build-android-x86_64/_deps/libdeflate-src \
        barretenberg_jni.cpp lmdb_stubs.c env_stubs.c \
        -Wl,--start-group \
        /tmp/bb/build-android-x86_64/lib/libbarretenberg.a \
        /tmp/bb/build-android-x86_64/lib/libenv.a \
        /tmp/bb/build-android-x86_64/_deps/libdeflate-build/libdeflate.a \
        -Wl,--end-group \
        -llog -lc++ \
        -o /tmp/jni/libbarretenberg_jni_x86_64.so

# =============================================================================
# ACVM Witness JNI Library
# =============================================================================

COPY vendor/vocdoni-passport-prover /tmp/vocdoni-passport-prover

RUN cd /tmp/vocdoni-passport-prover && \
    TOOLCHAIN=$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64 && \
    export CC_aarch64_linux_android=$TOOLCHAIN/bin/aarch64-linux-android26-clang && \
    export AR_aarch64_linux_android=$TOOLCHAIN/bin/llvm-ar && \
    export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER=$CC_aarch64_linux_android && \
    export CC_x86_64_linux_android=$TOOLCHAIN/bin/x86_64-linux-android26-clang && \
    export AR_x86_64_linux_android=$TOOLCHAIN/bin/llvm-ar && \
    export CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER=$CC_x86_64_linux_android && \
    cargo build --release -p acvm-witness-jni --target aarch64-linux-android && \
    cargo build --release -p acvm-witness-jni --target x86_64-linux-android

# =============================================================================
# React Native App Build
# =============================================================================

WORKDIR /app/VocdoniPassport

# Install npm dependencies (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy Gradle configuration (cached layer)
COPY android/build.gradle android/build.gradle
COPY android/app/build.gradle android/app/build.gradle
COPY android/settings.gradle android/settings.gradle
COPY android/gradle.properties android/gradle.properties
COPY android/gradle/ android/gradle/
COPY android/gradlew android/gradlew

# Pre-fetch Gradle dependencies
WORKDIR /app/VocdoniPassport/android
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies 2>/dev/null || true

# Copy full source
WORKDIR /app/VocdoniPassport
COPY . .

# Configure Android SDK path
RUN echo 'sdk.dir=/opt/android' > android/local.properties

# Install native libraries
RUN mkdir -p android/app/src/main/jniLibs/arm64-v8a && \
    mkdir -p android/app/src/main/jniLibs/x86_64 && \
    cp /tmp/jni/libbarretenberg_jni_arm64.so \
        android/app/src/main/jniLibs/arm64-v8a/libbarretenberg_jni.so && \
    cp /tmp/jni/libbarretenberg_jni_x86_64.so \
        android/app/src/main/jniLibs/x86_64/libbarretenberg_jni.so && \
    cp /tmp/vocdoni-passport-prover/target/aarch64-linux-android/release/libacvm_witness_jni.so \
        android/app/src/main/jniLibs/arm64-v8a/libacvm_witness_jni.so && \
    cp /tmp/vocdoni-passport-prover/target/x86_64-linux-android/release/libacvm_witness_jni.so \
        android/app/src/main/jniLibs/x86_64/libacvm_witness_jni.so

# Strip debug symbols to reduce APK size
RUN $ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip \
        android/app/src/main/jniLibs/arm64-v8a/*.so && \
    $ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip \
        android/app/src/main/jniLibs/x86_64/*.so

# Show library sizes
RUN echo "=== Native library sizes ===" && \
    ls -lh android/app/src/main/jniLibs/arm64-v8a/ && \
    ls -lh android/app/src/main/jniLibs/x86_64/

# Build the app
WORKDIR /app/VocdoniPassport/android
RUN --mount=type=secret,id=android_keystore,required=false \
    --mount=type=secret,id=android_keystore_password,required=false \
    --mount=type=secret,id=android_key_alias,required=false \
    --mount=type=secret,id=android_key_password,required=false \
    set -eux; \
    TASKS="${GRADLE_TASK}"; \
    if [ -n "${GRADLE_TASKS}" ]; then TASKS="${GRADLE_TASKS}"; fi; \
    export ORG_GRADLE_PROJECT_ANDROID_VERSION_NAME="${ANDROID_VERSION_NAME}"; \
    export ORG_GRADLE_PROJECT_ANDROID_VERSION_CODE="${ANDROID_VERSION_CODE}"; \
    if [ -f /run/secrets/android_keystore ]; then \
        export ORG_GRADLE_PROJECT_ANDROID_UPLOAD_STORE_FILE=/run/secrets/android_keystore; \
        export ORG_GRADLE_PROJECT_ANDROID_UPLOAD_STORE_TYPE=JKS; \
        export ORG_GRADLE_PROJECT_ANDROID_UPLOAD_STORE_PASSWORD="$(cat /run/secrets/android_keystore_password)"; \
        export ORG_GRADLE_PROJECT_ANDROID_UPLOAD_KEY_ALIAS="$(cat /run/secrets/android_key_alias)"; \
        export ORG_GRADLE_PROJECT_ANDROID_UPLOAD_KEY_PASSWORD="$(cat /run/secrets/android_key_password)"; \
    fi; \
    ./gradlew ${TASKS} --no-daemon \
        -Dorg.gradle.jvmargs="-Xmx4g" \
        ${GRADLE_EXTRA_ARGS}

# =============================================================================
# Output
# =============================================================================

RUN mkdir -p /out && \
    find app/build/outputs -name "*.apk" -exec cp {} /out/ \; && \
    find app/build/outputs -name "*.aab" -exec cp {} /out/ \; || true

# List outputs
RUN echo "=== Build outputs ===" && ls -lh /out/
