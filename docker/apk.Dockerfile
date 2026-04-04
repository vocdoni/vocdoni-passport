# syntax=docker/dockerfile:1.7

# Build Android APK with the native witness and proving stack required by VocdoniPassport.
#
# This Dockerfile is self-contained for the app repository:
# - it clones the pinned zkPassport Aztec fork for Android Barretenberg
# - it builds the Rust witness JNI crate from a staged copy of vocdoni-passport-prover
# - it packages both native libraries into the React Native Android app

FROM reactnativecommunity/react-native-android:latest

ARG AZTEC_PACKAGES_REF=a4f7c39e15e7835c1f5f491168afa4aaac286894
ARG GRADLE_TASK=assembleRelease
ARG GRADLE_EXTRA_ARGS=

USER root
RUN apt-get update && apt-get install -y --no-install-recommends clang lld curl ca-certificates git && \
    rm -rf /var/lib/apt/lists/*

ENV ANDROID_NDK_HOME=${ANDROID_HOME}/ndk/27.1.12297006

RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.89 --profile minimal && \
    . "$HOME/.cargo/env" && \
    rustup target add aarch64-linux-android x86_64-linux-android
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /tmp/bb
RUN git clone https://github.com/zkpassport/aztec-packages /tmp/aztec-packages && \
    cd /tmp/aztec-packages && \
    git checkout ${AZTEC_PACKAGES_REF}

RUN cp /tmp/aztec-packages/barretenberg/cpp/CMakeLists.txt ./ && \
    cp /tmp/aztec-packages/barretenberg/cpp/CMakePresets.json ./ && \
    cp -R /tmp/aztec-packages/barretenberg/cpp/cmake ./cmake && \
    cp -R /tmp/aztec-packages/barretenberg/cpp/src ./src
COPY docker/barretenberg-android-overlay/ /tmp/bb/

RUN perl -0pi -e 's{BUILD_COMMAND make -C libraries/liblmdb -e XCFLAGS=-fPIC liblmdb\\.a}{BUILD_COMMAND sh -lc "make -C libraries/liblmdb -e XCFLAGS=-fPIC liblmdb.a || true"}g' \
    /tmp/bb/cmake/lmdb.cmake && \
    sed -i '/barretenberg\/common\/net.hpp/a #include "barretenberg/common/mem.hpp"' \
    /tmp/bb/src/barretenberg/common/serialize.hpp && \
    sed -i 's|reinterpret_cast<uint8_t\\*>(aligned_alloc(64, heap_buf_size_aligned))|reinterpret_cast<uint8_t*>(bb::aligned_alloc(64, heap_buf_size_aligned))|g' \
    /tmp/bb/src/barretenberg/common/serialize.hpp

RUN cmake -B build-android-arm64 -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE=$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake \
    -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-26 \
    -DCMAKE_BUILD_TYPE=Release -DDISABLE_AZTEC_VM=ON -DMULTITHREADING=ON && \
    ninja -C build-android-arm64 barretenberg env libdeflate_static

RUN cmake -B build-android-x86_64 -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE=$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake \
    -DANDROID_ABI=x86_64 -DANDROID_PLATFORM=android-26 \
    -DCMAKE_BUILD_TYPE=Release -DDISABLE_AZTEC_VM=ON -DMULTITHREADING=ON && \
    ninja -C build-android-x86_64 barretenberg env libdeflate_static

COPY android/app/src/main/cpp/ /tmp/jni/

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

WORKDIR /app/VocdoniPassport

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

COPY android/build.gradle /app/VocdoniPassport/android/build.gradle
COPY android/app/build.gradle /app/VocdoniPassport/android/app/build.gradle
COPY android/settings.gradle /app/VocdoniPassport/android/settings.gradle
COPY android/gradle.properties /app/VocdoniPassport/android/gradle.properties
COPY android/gradle/ /app/VocdoniPassport/android/gradle/
COPY android/gradlew /app/VocdoniPassport/android/gradlew

WORKDIR /app/VocdoniPassport/android
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies 2>/dev/null || true

WORKDIR /app/VocdoniPassport
COPY . /app/VocdoniPassport/
RUN printf 'sdk.dir=/opt/android\n' > /app/VocdoniPassport/android/local.properties

RUN mkdir -p android/app/src/main/jniLibs/arm64-v8a && \
    mkdir -p android/app/src/main/jniLibs/x86_64 && \
    cp /tmp/jni/libbarretenberg_jni_arm64.so android/app/src/main/jniLibs/arm64-v8a/libbarretenberg_jni.so && \
    cp /tmp/jni/libbarretenberg_jni_x86_64.so android/app/src/main/jniLibs/x86_64/libbarretenberg_jni.so && \
    cp /tmp/vocdoni-passport-prover/target/aarch64-linux-android/release/libacvm_witness_jni.so \
        android/app/src/main/jniLibs/arm64-v8a/libacvm_witness_jni.so && \
    cp /tmp/vocdoni-passport-prover/target/x86_64-linux-android/release/libacvm_witness_jni.so \
        android/app/src/main/jniLibs/x86_64/libacvm_witness_jni.so && \
    # Strip debug symbols from native libraries to reduce size
    $ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip \
        android/app/src/main/jniLibs/arm64-v8a/*.so && \
    $ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip \
        android/app/src/main/jniLibs/x86_64/*.so && \
    # Show sizes after stripping
    ls -lh android/app/src/main/jniLibs/arm64-v8a/ && \
    ls -lh android/app/src/main/jniLibs/x86_64/

WORKDIR /app/VocdoniPassport/android
RUN ./gradlew ${GRADLE_TASK} --no-daemon \
    -Dorg.gradle.jvmargs="-Xmx4g" \
    ${GRADLE_EXTRA_ARGS}

RUN mkdir -p /out && \
    find app/build/outputs -name "*.apk" -exec cp {} /out/ \; && \
    find app/build/outputs -name "*.aab" -exec cp {} /out/ \; || true
