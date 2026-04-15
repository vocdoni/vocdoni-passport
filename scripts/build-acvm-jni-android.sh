#!/usr/bin/env bash
# Build libacvm_witness_jni.so for Android ABIs and install under android/app/src/main/jniLibs/.
# Requires ANDROID_NDK_HOME (or ANDROID_HOME with an NDK installed).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ -n "${VOCDONI_PASSPORT_PROVER_DIR:-}" ]]; then
  CRATE="$(cd "${VOCDONI_PASSPORT_PROVER_DIR}/crates/acvm-witness-jni" && pwd)"
elif [[ -d "$APP_ROOT/vendor/vocdoni-passport-prover/crates/acvm-witness-jni" ]]; then
  CRATE="$(cd "$APP_ROOT/vendor/vocdoni-passport-prover/crates/acvm-witness-jni" && pwd)"
elif [[ -d "$APP_ROOT/../vocdoni-passport-prover/crates/acvm-witness-jni" ]]; then
  CRATE="$(cd "$APP_ROOT/../vocdoni-passport-prover/crates/acvm-witness-jni" && pwd)"
else
  echo "error: set VOCDONI_PASSPORT_PROVER_DIR or stage vocdoni-passport-prover under vendor/" >&2
  exit 1
fi
NDK="${ANDROID_NDK_HOME:-}"
if [[ -z "$NDK" && -n "${ANDROID_HOME:-}" ]]; then
  NDK="$(find "$ANDROID_HOME/ndk" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort -V | tail -1 || true)"
fi
if [[ ! -d "${NDK:-}" ]]; then
  echo "error: set ANDROID_NDK_HOME to your Android NDK root" >&2
  exit 1
fi

HOST_TAG="linux-x86_64"
if [[ "$(uname -s)" == "Darwin" ]]; then
  if [[ "$(uname -m)" == "arm64" ]]; then
    HOST_TAG="darwin-arm64"
  else
    HOST_TAG="darwin-x86_64"
  fi
fi
TOOLCHAIN="$NDK/toolchains/llvm/prebuilt/$HOST_TAG"
export CC_aarch64_linux_android="$TOOLCHAIN/bin/aarch64-linux-android26-clang"
export AR_aarch64_linux_android="$TOOLCHAIN/bin/llvm-ar"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$CC_aarch64_linux_android"
export CC_x86_64_linux_android="$TOOLCHAIN/bin/x86_64-linux-android26-clang"
export AR_x86_64_linux_android="$TOOLCHAIN/bin/llvm-ar"
export CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER="$CC_x86_64_linux_android"

cd "$CRATE"
# -z max-page-size=16384: 16 KB page size support (required for Google Play targeting Android 15+)
RUSTFLAGS="${RUSTFLAGS:-} -C link-arg=-Wl,-z,max-page-size=16384" \
    cargo build --release --target aarch64-linux-android
RUSTFLAGS="${RUSTFLAGS:-} -C link-arg=-Wl,-z,max-page-size=16384" \
    cargo build --release --target x86_64-linux-android

JNI_DIR="$APP_ROOT/android/app/src/main/jniLibs"
mkdir -p "$JNI_DIR/arm64-v8a" "$JNI_DIR/x86_64"
cp target/aarch64-linux-android/release/libacvm_witness_jni.so "$JNI_DIR/arm64-v8a/"
cp target/x86_64-linux-android/release/libacvm_witness_jni.so "$JNI_DIR/x86_64/"
echo "Installed libacvm_witness_jni.so to jniLibs (arm64-v8a, x86_64)."
