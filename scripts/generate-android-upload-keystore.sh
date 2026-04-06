#!/usr/bin/env bash
set -euo pipefail

if ! command -v keytool >/dev/null 2>&1; then
  echo "error: keytool is required. Install a JDK and retry." >&2
  exit 1
fi

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}"
DEFAULT_OUTPUT="${STATE_DIR}/vocdoni-passport/signing/android-upload-keystore.jks"
OUTPUT_PATH="${1:-$DEFAULT_OUTPUT}"
KEY_ALIAS="${ANDROID_UPLOAD_KEY_ALIAS:-upload}"
STORE_PASSWORD="${ANDROID_UPLOAD_KEYSTORE_PASSWORD:-}"
KEY_PASSWORD="${ANDROID_UPLOAD_KEY_PASSWORD:-}"
DNAME="${ANDROID_UPLOAD_DNAME:-CN=Vocdoni Passport, OU=Mobile, O=Vocdoni, L=Barcelona, S=Barcelona, C=ES}"

if [ -z "$STORE_PASSWORD" ] || [ -z "$KEY_PASSWORD" ]; then
  echo "error: set ANDROID_UPLOAD_KEYSTORE_PASSWORD and ANDROID_UPLOAD_KEY_PASSWORD before running this script." >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

if [ -e "$OUTPUT_PATH" ]; then
  echo "error: refusing to overwrite existing keystore: $OUTPUT_PATH" >&2
  exit 1
fi

keytool -genkeypair \
  -v \
  -keystore "$OUTPUT_PATH" \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 4096 \
  -validity 9125 \
  -storepass "$STORE_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -dname "$DNAME"

echo
echo "Generated Android upload keystore:"
echo "  $OUTPUT_PATH"
echo
echo "GitHub Actions secrets to configure:"
echo "  ANDROID_UPLOAD_KEYSTORE_BASE64"
echo "  ANDROID_UPLOAD_KEYSTORE_PASSWORD"
echo "  ANDROID_UPLOAD_KEY_ALIAS"
echo "  ANDROID_UPLOAD_KEY_PASSWORD"
echo
echo "Base64 command:"
echo "  python3 - <<'PY' \"$OUTPUT_PATH\""
echo "import base64, pathlib, sys"
echo "print(base64.b64encode(pathlib.Path(sys.argv[1]).read_bytes()).decode())"
echo "PY"
