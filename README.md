# Vocdoni Passport

Privacy-preserving identity verification using zkPassport and zero-knowledge proofs.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![CI](https://github.com/vocdoni/vocdoni-passport/actions/workflows/ci.yml/badge.svg)](https://github.com/vocdoni/vocdoni-passport/actions/workflows/ci.yml)
[![Android Build](https://github.com/vocdoni/vocdoni-passport/actions/workflows/android-build.yml/badge.svg)](https://github.com/vocdoni/vocdoni-passport/actions/workflows/android-build.yml)
[![iOS Build](https://github.com/vocdoni/vocdoni-passport/actions/workflows/ios-build.yml/badge.svg)](https://github.com/vocdoni/vocdoni-passport/actions/workflows/ios-build.yml)

## Continuous integration

- **CI** runs TypeScript checks, ESLint, and Jest on every push (Ubuntu, GitHub-hosted).
- **Android image build** is Docker-heavy and uses `runs-on: [self-hosted, linux, X64]` (GitHub’s default labels for a Linux x64 self-hosted runner). The machine must have Docker. Register it under **Settings → Actions → Runners** for this repository.
- **iOS build** uses GitHub-hosted `macOS` runners.

## Overview

Vocdoni Passport is a mobile application that enables users to prove attributes about their identity (age, nationality, etc.) without revealing their actual identity documents. It uses the [zkPassport](https://zkpassport.id) protocol to generate zero-knowledge proofs from NFC-enabled identity documents (passports, national ID cards).

### Key Features

- **Privacy-First**: Prove you meet requirements without revealing personal data
- **Secure Storage**: Identity data is encrypted and stored locally on your device
- **Biometric Protection**: Access requires device unlock (fingerprint, face, or PIN)
- **Embedded Wallet**: Built-in Ethereum wallet for signing proofs
- **Cross-Platform**: Available for Android and iOS

### How It Works

1. **Scan your ID**: Use NFC to read your passport or national ID card
2. **Store securely**: Your ID data is encrypted and stored on-device
3. **Sign petitions**: Scan a QR code to participate in a petition
4. **Generate proof**: Create a zero-knowledge proof that you meet the requirements
5. **Submit**: The proof is verified without revealing your identity

## Installation

### Pre-built APK (Android)

Download the latest APK from the [Releases](https://github.com/vocdoni/vocdoni-passport/releases) page.

Tagged GitHub releases also attach a signed Android `AAB` for Play Console upload.

### Build from Source

#### Prerequisites

- Node.js 18+
- Docker (for Android builds)
- macOS with Xcode 16+ (for iOS builds)
- Rust 1.89+ (for native library development)

#### Android Build

```bash
# Build release APK using Docker (works on any OS)
make apk

# Install on connected device
make apk-install
```

#### iOS Build

iOS builds require macOS. You can either:

1. **Use GitHub Actions** (recommended for CI/CD):
   - Push to the `main` branch, or
   - Manually trigger the workflow from the Actions tab

2. **Build locally on macOS**:
   ```bash
   # Install dependencies
   npm install --legacy-peer-deps
   cd ios && pod install && cd ..

   # Open in Xcode
   open ios/VocdoniPassport.xcworkspace
   ```

See `make ios-info` for detailed iOS build instructions.

## Project Structure

```
├── src/
│   ├── components/      # Reusable UI components
│   ├── screens/         # App screens (IDs, Scanner, History, etc.)
│   ├── services/        # Business logic (proof generation, storage)
│   ├── native/          # Native module bridges
│   └── navigation/      # Navigation configuration
├── android/             # Android native code and configuration
├── ios/                 # iOS native code and configuration
├── docker/              # Docker build configurations
└── .github/workflows/   # CI/CD pipelines
```

## Architecture

The app follows a client-server architecture:

- **Mobile App** (this repository): Handles ID scanning, storage, and inner proof generation
- **Prover Server** ([vocdoni-passport-prover](https://github.com/vocdoni/vocdoni-passport-prover)): Generates outer proofs and verifies submissions

### Native Dependencies

The app includes two native proving components:

| Component | Platform | Purpose |
|-----------|----------|---------|
| `barretenberg_jni` | Android | ZK proof generation |
| `acvm-witness-jni` | Android/iOS | Witness solving for circuits |

## Development

### Local Development Setup

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start Metro bundler
npm start

# Run on Android (requires connected device or emulator)
npm run android

# Run on iOS (requires macOS)
npm run ios
```

### Prover Dependency

The build requires the `acvm-witness-jni` crate from `vocdoni-passport-prover`. The Makefile resolves this dependency in order:

1. `PROVER_REPO_LOCAL_DIR` environment variable
2. `../vocdoni-passport-prover` (sibling directory)
3. Clone from `PROVER_REPO_URL` at `PROVER_REPO_REF`

Override example:
```bash
make apk PROVER_REPO_LOCAL_DIR=/path/to/vocdoni-passport-prover
```

## GitHub Actions Secrets

For automated builds, configure these repository secrets:

### Android Release Builds

| Secret | Description |
|--------|-------------|
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | Base64-encoded Play Store upload keystore |
| `ANDROID_UPLOAD_KEYSTORE_PASSWORD` | Upload keystore password |
| `ANDROID_UPLOAD_KEY_ALIAS` | Upload key alias |
| `ANDROID_UPLOAD_KEY_PASSWORD` | Upload key password |

### iOS Release Builds

| Secret | Description |
|--------|-------------|
| `IOS_DISTRIBUTION_CERTIFICATE_BASE64` | Base64-encoded .p12 distribution certificate |
| `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` | Certificate password |
| `IOS_PROVISIONING_PROFILE_BASE64` | Base64-encoded .mobileprovision file |
| `KEYCHAIN_PASSWORD` | Temporary keychain password |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APP_STORE_CONNECT_API_KEY_ID` | App Store Connect API Key ID |
| `APP_STORE_CONNECT_API_ISSUER_ID` | App Store Connect Issuer ID |
| `APP_STORE_CONNECT_API_KEY_BASE64` | Base64-encoded .p8 API key |

## Release Process

See [docs/releasing.md](docs/releasing.md) for:

- Android upload key generation
- GitHub Actions secret setup
- tag-based releases
- TestFlight uploads for iPhone testing

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting a pull request.

### Code Style

- Run `npm run lint` before committing
- Follow the existing code patterns
- Write meaningful commit messages

## Security

This application handles sensitive identity data. Security considerations:

- All ID data is encrypted at rest using device-level encryption
- Biometric/PIN authentication is required to access stored IDs
- Zero-knowledge proofs ensure no personal data is transmitted
- The app never sends raw identity documents to any server

For security issues, please email security@vocdoni.io instead of opening a public issue.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

## Related Projects

- [vocdoni-passport-prover](https://github.com/vocdoni/vocdoni-passport-prover) - Server-side prover and verification
- [zkPassport](https://zkpassport.id) - The underlying zero-knowledge passport protocol

## Support

- [Documentation](https://docs.vocdoni.io)
- [Discord](https://discord.gg/vocdoni)
- [Twitter](https://twitter.com/voaborrar)

---

Built with ❤️ by [Vocdoni](https://vocdoni.io)
