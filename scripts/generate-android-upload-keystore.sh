#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}"
DEFAULT_OUTPUT="${STATE_DIR}/vocdoni-passport/signing/android-upload-keystore.jks"
OUTPUT_PATH="${1:-$DEFAULT_OUTPUT}"
KEY_ALIAS="${ANDROID_UPLOAD_KEY_ALIAS:-upload}"
STORE_PASSWORD="${ANDROID_UPLOAD_KEYSTORE_PASSWORD:-}"
KEY_PASSWORD="${ANDROID_UPLOAD_KEY_PASSWORD:-}"
DNAME="${ANDROID_UPLOAD_DNAME:-CN=Vocdoni Passport, OU=Mobile, O=Vocdoni, L=Barcelona, S=Barcelona, C=ES}"
DOCKER_IMAGE="${ANDROID_KEYTOOL_DOCKER_IMAGE:-eclipse-temurin:21-jdk}"
USE_DOCKER="${ANDROID_UPLOAD_USE_DOCKER:-auto}"

if [ -z "$STORE_PASSWORD" ] || [ -z "$KEY_PASSWORD" ]; then
  echo "error: set ANDROID_UPLOAD_KEYSTORE_PASSWORD and ANDROID_UPLOAD_KEY_PASSWORD before running this script." >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

if [ -e "$OUTPUT_PATH" ]; then
  echo "error: refusing to overwrite existing keystore: $OUTPUT_PATH" >&2
  exit 1
fi

OUTPUT_DIR="$(cd "$(dirname "$OUTPUT_PATH")" && pwd -P)"
OUTPUT_BASENAME="$(basename "$OUTPUT_PATH")"

run_keytool_local() {
  keytool -genkeypair \
    -v \
    -storetype JKS \
    -keystore "$OUTPUT_PATH" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA \
    -keysize 4096 \
    -validity 9125 \
    -storepass "$STORE_PASSWORD" \
    -keypass "$KEY_PASSWORD" \
    -dname "$DNAME"
}

run_keytool_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "error: docker is required for the containerized fallback." >&2
    exit 1
  fi

  docker run --rm \
    -u "$(id -u):$(id -g)" \
    -v "$OUTPUT_DIR:/work" \
    -w /work \
    "$DOCKER_IMAGE" \
    keytool -genkeypair \
      -v \
      -storetype JKS \
      -keystore "$OUTPUT_BASENAME" \
      -alias "$KEY_ALIAS" \
      -keyalg RSA \
      -keysize 4096 \
      -validity 9125 \
      -storepass "$STORE_PASSWORD" \
      -keypass "$KEY_PASSWORD" \
      -dname "$DNAME"
}

case "$USE_DOCKER" in
  always)
    run_keytool_docker
    ;;
  never)
    if ! command -v keytool >/dev/null 2>&1; then
      echo "error: keytool is not installed and ANDROID_UPLOAD_USE_DOCKER=never was set." >&2
      exit 1
    fi
    run_keytool_local
    ;;
  auto)
    if command -v keytool >/dev/null 2>&1; then
      run_keytool_local
    else
      run_keytool_docker
    fi
    ;;
  *)
    echo "error: ANDROID_UPLOAD_USE_DOCKER must be one of: auto, always, never" >&2
    exit 1
    ;;
esac

KEYSTORE_BASE64="$(
  python3 - <<'PY' "$OUTPUT_PATH"
import base64, pathlib, sys
print(base64.b64encode(pathlib.Path(sys.argv[1]).read_bytes()).decode())
PY
)"

echo
echo "Generated Android upload keystore:"
echo "  $OUTPUT_PATH"
echo
echo "Secret values:"
echo "  ANDROID_UPLOAD_KEY_ALIAS=$KEY_ALIAS"
echo "  ANDROID_UPLOAD_KEYSTORE_PASSWORD=$STORE_PASSWORD"
echo "  ANDROID_UPLOAD_KEY_PASSWORD=$KEY_PASSWORD"
echo
echo "GitHub Actions secrets to configure:"
echo "  ANDROID_UPLOAD_KEYSTORE_BASE64"
echo "  ANDROID_UPLOAD_KEYSTORE_PASSWORD"
echo "  ANDROID_UPLOAD_KEY_ALIAS"
echo "  ANDROID_UPLOAD_KEY_PASSWORD"
echo
echo "ANDROID_UPLOAD_KEYSTORE_BASE64:"
echo "$KEYSTORE_BASE64"
