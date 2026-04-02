# VocdoniPassport

React Native mobile client for zkPassport proving stack.

## Responsibilities

The app is intentionally thin. It owns:

- QR scan or pasted request link intake
- petition and disclosure review
- MRZ capture
- NFC document reading
- native witness and inner proof generation
- submission of inner proofs to the Go server
- user-facing progress, success, and support-report UI

The app does not own:

- outer proof generation
- zkPassport artifact versioning
- `bb` version pinning
- server-side aggregation logic

Those responsibilities live in vocdoni-passport-prover.

## Repository Layout

- `App.tsx`
  app flow and screen composition
- `src/native/`
  React Native bridges to native witness and proving modules
- `src/services/`
  HTTP, proof, preload, and export helpers
- `android/`
  Android app and JNI integration
- `ios/`
  iOS app and native integration
- `scripts/build-acvm-jni-android.sh`
  Android helper for the Rust witness JNI crate

## Build And Install

Run commands from this repository root.

Build the Android release APK:

```bash
make apk
```

Install the latest built APK on a connected Android device:

```bash
make apk-install
```

Clear app storage and stop the app:

```bash
make apk-reset
```

Build, install, and reset in one step:

```bash
make apk-clean-install
```

Pull the latest exported fixture from a connected device:

```bash
make fixture-pull
```

The release artifact is written to:

- `out/apk/app-release.apk`

## Prover Dependency

The app build needs the `acvm-witness-jni` crate from `vocdoni-passport-prover`.

The Makefile resolves that dependency in this order:

1. `PROVER_REPO_LOCAL_DIR`
2. `../vocdoni-passport-prover`
3. `PROVER_REPO_URL` + `PROVER_REPO_REF`

Useful overrides:

```bash
make apk PROVER_REPO_LOCAL_DIR=../vocdoni-passport-prover
make apk PROVER_REPO_URL=https://github.com/vocdoni/vocdoni-passport-prover.git PROVER_REPO_REF=main
```

The staged prover source is local build data under `vendor/vocdoni-passport-prover/` and is not tracked.

## Runtime Flow

1. Load a petition request from QR or a pasted request link.
2. Ping the remote server health endpoint.
3. Show the petition summary and disclosures.
4. Capture the MRZ.
5. Read the NFC chip.
6. Generate inner proofs on device.
7. Send the inner proof bundle to the server.
8. Show the outer-proof success result or an error report.

## Native Dependencies

The app relies on two native proving components:

- `barretenberg_jni`
  Android native bridge for proving
- `acvm-witness-jni`
  Rust witness-solving JNI library built from the staged `vocdoni-passport-prover` source

The Docker APK build compiles those components from pinned upstream inputs and the staged prover workspace.

## Maintenance Rules

- Keep app-facing copy short and clear.
- Keep proving and version decisions out of the app when they can live in the prover repository.
- Avoid machine-specific paths and environment assumptions in scripts and docs.
