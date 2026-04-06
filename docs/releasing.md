# Releasing

The repository has two distribution paths:

- Android GitHub release assets: signed `APK` and signed `AAB`
- iOS device testing: signed `IPA` through the `iOS Build` workflow and optional TestFlight upload

## Android upload key

Generate the Play Store upload key outside the repository so it never risks being committed.

Default location:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/vocdoni-passport/signing/android-upload-keystore.jks
```

Generate it with:

```bash
ANDROID_UPLOAD_KEYSTORE_PASSWORD='CHANGE_ME' \
ANDROID_UPLOAD_KEY_PASSWORD='CHANGE_ME' \
ANDROID_UPLOAD_KEY_ALIAS='upload' \
./scripts/generate-android-upload-keystore.sh
```

Add these repository secrets in GitHub Actions:

- `ANDROID_UPLOAD_KEYSTORE_BASE64`
- `ANDROID_UPLOAD_KEYSTORE_PASSWORD`
- `ANDROID_UPLOAD_KEY_ALIAS`
- `ANDROID_UPLOAD_KEY_PASSWORD`

Encode the keystore for `ANDROID_UPLOAD_KEYSTORE_BASE64` with:

```bash
python3 - <<'PY' "${XDG_STATE_HOME:-$HOME/.local/state}/vocdoni-passport/signing/android-upload-keystore.jks"
import base64, pathlib, sys
print(base64.b64encode(pathlib.Path(sys.argv[1]).read_bytes()).decode())
PY
```

The release workflow uses the upload key at build time and does not commit it or store it in the repository.

## iOS release secrets

For signed `IPA` output or TestFlight upload, configure these GitHub secrets:

- `IOS_DISTRIBUTION_CERTIFICATE_BASE64`
- `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`
- `IOS_PROVISIONING_PROFILE_BASE64`
- `KEYCHAIN_PASSWORD`
- `APPLE_TEAM_ID`
- `APP_STORE_CONNECT_API_KEY_ID`
- `APP_STORE_CONNECT_API_ISSUER_ID`
- `APP_STORE_CONNECT_API_KEY_BASE64`

## Versioning

When the `Release` workflow runs:

- Android `versionName` comes from the tag without the leading `v`
- Android `versionCode` comes from the GitHub Actions run number

Example:

- tag `v1.2.3`
- Android `versionName`: `1.2.3`

## Creating a GitHub release

Push a tag:

```bash
git tag v1.2.3
git push origin v1.2.3
```

Or trigger the `Release` workflow manually from the Actions tab and provide `v1.2.3`.

The GitHub release attaches:

- signed Android `APK`
- signed Android `AAB`
- iOS simulator `.zip`

## iPhone testing

For real iPhone testing, use the `iOS Build` workflow manually:

- `build_type=release`
- `upload_testflight=true`

That path produces a signed `IPA` and can upload it to TestFlight when the iOS secrets are configured.
