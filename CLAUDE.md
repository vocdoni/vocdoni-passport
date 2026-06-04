# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

React Native (TypeScript) mobile app for the Vocdoni Passport flow: read an NFC passport/ID, generate **zkPassport inner proofs on-device**, and upload them to the `vocdoni-passport-prover` server, which verifies them and produces the outer EVM proof. The app is a thin capture / transport / native-wrapper layer.

**Critical architecture fact: proving is NATIVE, not JS/WASM.** Hermes cannot run `@noir-lang/acvm_js`, so there are **no** `@noir-lang/*` or `@aztec/bb.js` JS deps. Instead:
- **Witness solving** → `libacvm_witness_jni.so` (Rust, the `acvm-witness-jni` crate from the sibling `vocdoni-passport-prover` repo).
- **Proving** → `libbarretenberg_jni.so` (C++ Barretenberg compiled for Android; JNI module loads `barretenberg_jni`, msgpack `bbapi` interface mirroring `@aztec/bb.js`).
- Both `.so` files are prebuilt by `docker/apk.Dockerfile` and placed in `android/app/src/main/jniLibs/{arm64-v8a,x86_64}/`. There is no `externalNativeBuild`.
- iOS links the same `acvm-witness-jni` crate as a staticlib (Xcode "Build Rust ACVM witness staticlib" phase); the bb prover JNI is **Android-only**.

This repo is **coupled to the sibling repo `../vocdoni-passport-prover`** (same parent dir). `make prepare-prover-source` vendors its `crates/` into `vendor/` to build `acvm-witness-jni`. Any noir/ACVM version change happens in the prover repo's `Cargo.toml` and flows here through that vendoring.

## Current pinned stack (as of 2026-06)

| Component | Version | Where pinned |
|---|---|---|
| zkPassport circuits | **0.18.0** | `src/services/ProofGenerator.ts` `CIRCUIT_VERSION` |
| `@zkpassport/registry` | 0.14.0 | `package.json` |
| `@zkpassport/utils` | 0.36.0 (exact — registry pins it) | `package.json` |
| `@zkpassport/poseidon2` | 0.6.2 | `package.json` |
| noir / ACVM | 1.0.0-beta.20 (`b4236c19`) | `../vocdoni-passport-prover/Cargo.toml` |
| Barretenberg (bb) | 4.2.0-aztecnr-rc.2 (`AztecProtocol/aztec-packages@a4701a61`) | `docker/apk.Dockerfile` `AZTEC_PACKAGES_REF` |
| chain | Sepolia, chainId **11155111** | `ProofGenerator.ts` `CHAIN_ID` |

zkPassport renamed their hosting path **`sepolia → testnet`** in `@zkpassport/registry` 0.14. The app does NOT hardcode URLs — `chainId 11155111` selects the testnet endpoints **inside the SDK**. So a network change is just `CHAIN_ID` + the SDK version.

## Commands

```bash
npm install --legacy-peer-deps   # RN peer-dep graph needs this
npm run typecheck                # tsc --noEmit
npm run lint
npm test                         # jest  (single: npm test -- -t "name")

make apk                 # release APK -> out/app-release.apk (Docker; builds bb + acvm .so + gradle)
make apk-install         # adb install on device
make apk-clean-install   # build + clear app data + install
make fixture-pull        # pull a captured fixture off the device
make ios-info            # iOS build instructions (needs macOS/Xcode)
```

`make apk` builds **release** (`assembleRelease`). For a **debuggable, standalone (no-Metro)** APK — required for `run-as` access (CRS pre-seed, sandbox inspection):

```bash
make prepare-prover-source
docker build -f docker/apk.Dockerfile \
  --build-arg GRADLE_TASK=assembleDebug \
  --build-arg GRADLE_EXTRA_ARGS=-PbundleInDebug=true \
  -t vocdoni-passport-android-debug .
docker create --name x vocdoni-passport-android-debug && docker cp x:/out/app-debug.apk ./out/ && docker rm -f x
```
`-PbundleInDebug=true` bundles JS into the APK and sets `USE_DEV_SERVER=false` (build.gradle), so it runs without Metro.

## Hard-won gotchas (do not relearn these)

1. **Metro ignores package `exports` maps.** Several deps ship submodules only via the `exports` field (`@zkpassport/utils/circuits`, `@zkpassport/utils/registry`, `@peculiar/utils/{bytes,converters,encoding,legacy,pem}`, `ethers/utils`). This Metro version can't resolve them → "Unable to resolve module". Fix = explicit `resolveRequest` aliases in `metro.config.js`. When a dep bump pulls in a new subpath import, add it there. Validate fast with `npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output /tmp/b --reset-cache` (this is what the Gradle JS-bundle step does).
2. **Native bb is built from `AztecProtocol/aztec-packages`** (NOT the old `zkpassport/aztec-packages` fork) at the tag matching the target bb version, with Android overlay patches in `docker/barretenberg-android-overlay/` (force-include `android_compat.hpp`, `posix_memalign` `aligned_alloc` shim in `mem.hpp`, `/dev/urandom` RNG in `engine.cpp`, an `AztecProtocol/msgpack-c` pin, `MOBILE=ON`). These overlay files = upstream-bb-file + minimal Android delta; re-validate them against each new bb major.
3. **`MOBILE=ON` excludes the Aztec-VM, but the JNI still references one AVM symbol** → `android/app/src/main/cpp/env_stubs.c` stubs `acir_format::create_avm2_recursion_constraints_goblin`. It is wrapped in `extern "C"` so the clang++ driver emits the already-mangled name verbatim (without `extern "C"` it gets re-mangled and the link/dlopen still fails). Without this stub, `libbarretenberg_jni.so` fails to `dlopen` and proving dies with "Native library not loaded". If a future bb adds more excluded-but-referenced symbols, find them with: extract the `.so` from the APK and `nm -D -u libbarretenberg_jni.so | grep -i avm` — stub each.
4. **bb 4.x CLI kept the low-level flags.** `--scheme ultra_honk`, `--oracle_hash {poseidon2,keccak}`, `--disable_zk`, `--ipa_accumulation`, `--slow_low_memory`, `--storage_budget` still exist as advanced flags (mutually exclusive with the newer `--verifier_target`). Inner proofs = poseidon2+ZK = `--verifier_target noir-recursive`; outer EVM = keccak+no-zk = `evm-no-zk`. The prover-repo's `proving.rs` uses the low-level flags and is forward-compatible.
5. **CRS is large and not bundled.** The app downloads the structured reference string from `https://crs.aztec.network` into `<DocumentDir>/bb-crs/`. Sizing is `(nextPow2(maxCircuitSize)+1)*64` per file. On-device the baseline circuits top out at the DSC RSA‑4096 (`size` ≈ 269163 ≈ 2^19), so `bn254_g1.dat` is only ~**32 MiB** — the ~256 MiB / 2^22 figure is the **outer** circuit, which is proven server-side, not on the device. A fresh install must download the CRS (the in-app downloader is single-shot, no resume), which can fail on flaky networks. See "Pre-seeding the CRS" below. **Never read a CRS file whole into the JS heap** — `RNFS.readFile(path,'base64')`/`Buffer.from` on a CRS file is wasteful and, for a large enough circuit, can OOM Hermes (512 MiB JS-heap growth limit). `CRSManager` merges download parts natively: `RNFS.moveFile` for a fresh download, chunked `RNFS.read`+`appendFile` (8 MiB) for a resume. (Note: this path is skipped entirely when the CRS is **pre-seeded** via debug `run-as`, so it only exercises on a clean install that actually downloads.)
6. **Certificate registry format is V1** (testnet, 2026): packaged certs dropped per-cert `hash_algorithm`/`authority_key_identifier`/`type` and renamed `serialised → certificates_serialised`. The app uses the SDK so it's handled; the prover repo has its own parser that needed updating.
7. The app sets `FLAG_SECURE` on ID screens → `adb exec-out screencap` returns a black image. Drive UI verification by **logcat**, not screenshots.

## How to update to a new zkPassport circuit version

This is a coordinated change across **both** repos. Order: discover → prover → app → verify.

### 1. Discover the target versions (no guessing — read the live registry)
```bash
# Latest circuit manifest version on testnet (chainId 11155111):
curl -sI "https://circuits2.zkpassport.id/testnet/by-version/<V>/manifest.json"   # 302 = exists
# Read a packaged circuit to get the exact noir + bb versions it was built with:
curl -sL "https://circuits2.zkpassport.id/testnet/by-version/<V>/manifest.json" | gunzip | \
  jq -r '.circuits["disclose_bytes_evm"].hash'    # -> <hash>
curl -sL "https://circuits2.zkpassport.id/testnet/by-hash/<hash>.json" | gunzip | \
  jq '{noir_version, bb_version}'
# Latest SDK packages:
for p in registry utils poseidon2; do curl -s "https://registry.npmjs.org/@zkpassport/$p/latest" | jq -r '.version'; done
```
Then resolve: the noir git tag (`github.com/noir-lang/noir` tag = the `noir_version` minus the `+commit`), and the bb release (search `AztecProtocol/aztec-packages` releases/tags for the `bb_version`; confirm a prebuilt `barretenberg-amd64-linux.tar.gz` exists, else build from source).

### 2. Prover repo (`../vocdoni-passport-prover`) — do this first
- `Cargo.toml`: bump the six noir crates (`acvm acir bn254_blackbox_solver brillig_vm nargo noirc_abi`) to the new `tag`. `cargo update -p indexmap` etc. if the lock conflicts.
- `config/compatibility-matrix.json`: `circuit_version`, `manifest_root`, `noir_version`, `bb_version` (and `certificate_base_url`/`manifest_base_url`/`artifact_base_url` only if the host path scheme changes again).
- Regenerate offline assets: `prover-cli snapshot-registry --version <V> --circuit ... --output snapshots/...<V>.json` then `materialize-snapshot --snapshot ... --out-dir artifacts/registry/minimal-default-<V>`. Delete the old version dirs; update every `minimal-default-<old>` reference (server-go defaults, Dockerfile `ENV`, scripts).
- Regenerate the outer Solidity verifier: `bb write_solidity_verifier -k <outer vkey> -t evm-no-zk --optimized -o OuterCount4.sol`; update the forge test's public-input count if the outer shape changed.
- **Server/prover Dockerfiles** (`Dockerfile`, `server-go/Dockerfile`) — easy to miss:
  - `AZTEC_PACKAGES_REF` = the new bb commit (these build bb **from source** for the server; `AVM` flag note below).
  - `ARG ZKPASSPORT_UTILS_VERSION` = the SDK `utils` version to install for the server's `aggregate-inputs.cjs`/`outer-inputs.cjs` (keep == the app's `@zkpassport/utils`). The `zkp-builder` stage `npm install`s the **published** package — do NOT build utils from source: 0.36.0's `oprf` submodule imports `@taceo/oprf-core` without declaring it, so a from-source `bun run build` fails to resolve it.
  - bb source build flags: bb 4.2 dropped `DISABLE_AZTEC_VM` → use `-DAVM=OFF` **and** `-DAVM_TRANSPILER_LIB=` (the `clang20` preset points the latter at a Rust artifact not built in the C++-only stage). Also `sed` out `add_subdirectory(barretenberg/nodejs_module)` (bb 4.2 configures it via `node -p ...`, and the builder has no Node). Option names live in `barretenberg/cpp/{CMakeLists.txt,src/CMakeLists.txt}` at the bb ref — re-verify after a bb major bump. `msgpack.cmake` auto-fetches its pin; the legacy `sed` patch is a no-op on 4.2. The source-built `bb --version` reports zeros (cosmetic; nothing checks it).
  - `ENV VOCDONI_ARTIFACTS_DIR` and `server-go/.env.example` → `minimal-default-<V>`. `docker-compose.yml` needs no version edits (all via `.env`).
  - Local non-Docker server run additionally needs `VOCDONI_ZKPASSPORT_UTILS_DIST` (Docker places utils at the path the scripts expect; a bare run does not).
- `cargo test`, `go test ./server-go/...`, and validate bb⇄circuit compat: `bb write_vk -b <bytecode> -t noir-recursive --output_format json` should reproduce the packaged `vkey_hash`.

### 3. This app repo
- `package.json`: bump `@zkpassport/registry` / `@zkpassport/utils` / `@zkpassport/poseidon2` (match registry's exact utils pin to avoid a duplicate copy). `npm install --legacy-peer-deps`.
- `src/services/ProofGenerator.ts`: `CIRCUIT_VERSION` → `<V>`. (Leave `CHAIN_ID` unless the network changes.)
- `metro.config.js`: if the new SDK adds subpath-export imports, add resolver aliases (see gotcha #1). Validate with the `react-native bundle` one-liner.
- Native bb: `docker/apk.Dockerfile` → set `AZTEC_PACKAGES_REF` to the new bb commit (and the clone URL if the fork changes). Re-port `docker/barretenberg-android-overlay/*` against the new bb source (diff each overlay file vs the new upstream file, re-apply the Android delta). Re-check the C++ API `barretenberg_jni.cpp` uses (`bbapi`, `CircuitProve/Verify/ComputeVk` msgpack schemas, `bb::srs::*`, `backing_memory.hpp`) and the `env_stubs.c`/`lmdb_stubs.c` stub set.
- `acvm-witness-jni` updates automatically from the prover repo via `make prepare-prover-source`.
- `npm run typecheck && npm test`, then `make apk`. **An APK build that compiles the native libs cleanly is the real validation of the native port** (the overlay re-port can't be checked any other way without the NDK).

### 4. Verify on a real device (the only true E2E)
The host `prove-fixture` path needs a fresh fixture (the in-tree examples predate the current cert masterlist and fail the SDK's CSCA matcher). The authoritative test is a device round-trip — see next section.

## On-device end-to-end verification (real passport)

```bash
# 1. Install (debuggable build if you need run-as / CRS pre-seed)
adb install -r out/app-debug.apk        # -r keeps data IF same signing key
# 2. Run the server with the migrated stack (MongoDB is optional)
#    Needs: prover-cli (cargo build --release -p prover-cli --features native-prover),
#    a bb 4.x binary, the 0.18.0 artifacts dir, and (for non-Docker runs):
VOCDONI_ZKPASSPORT_UTILS_DIST=<app>/node_modules/@zkpassport/utils/dist/cjs/index.cjs \
BB_BINARY_PATH=/path/to/bb VOCDONI_PROVER_BINARY_PATH=.../prover-cli \
VOCDONI_ARTIFACTS_DIR=.../artifacts/registry/minimal-default-0.18.0 \
VOCDONI_WORKSPACE_ROOT=.../vocdoni-passport-prover \
VOCDONI_PUBLIC_BASE_URL=http://127.0.0.1:8080 .../vocdoni-passport-server
# 3. Make the host server reachable from the device
adb reverse tcp:8080 tcp:8080
# 4. Deliver a proof request WITHOUT a camera-scanned QR (deeplink; payload from /api/request-config):
REQ=$(curl -s "http://127.0.0.1:8080/api/request-config?disclose=firstname")   # aggregateUrl -> 127.0.0.1:8080
B64=$(printf '%s' "$REQ" | base64 -w0 | tr '+/' '-_' | tr -d '=')
adb shell am start -a android.intent.action.VIEW -d "https://vocdoni.link/passport?request=$B64" com.vocdonipassport
# 5. Tap "Sign" in the app. Watch:
adb logcat -v time -s ReactNativeJS   # [ProofTiming] witness.* / prove.* per circuit
# Success = server logs "aggregate request completed" + POST /api/proofs/aggregate -> 200.
```
Proof from a real run: 5 inner proofs (DSC RSA-4096 ~30s, others ~10s), server verifies + builds `outer_evm_count_5` (~115s) → **HTTP 200**. The app proves from the **stored** ID (`getIDById`), so no passport re-tap is needed once an ID is added.

### Pre-seeding the CRS (when the 256 MiB download fails)
Only works on a **debuggable** build (release isn't `run-as`-accessible). Sizes must satisfy the app's check (`fileSize >= need`), where `need = (nextPow2(maxCircuitSize)+1)*64`; for the 2^22 outer that's `g1=268435520`, `grumpkin=16777280`, `g2=full(128)`.
```bash
curl -s -r 0-268435519 https://crs.aztec.network/g1.dat       -o bn254_g1.dat
curl -s            https://crs.aztec.network/g2.dat           -o bn254_g2.dat
curl -s -r 0-16777279  https://crs.aztec.network/grumpkin_g1.dat -o grumpkin_g1.flat.dat
truncate -s 16777280 grumpkin_g1.flat.dat   # pad the +1 over-request (unused point)
adb push bn254_g1.dat bn254_g2.dat grumpkin_g1.flat.dat /data/local/tmp/
adb shell 'run-as com.vocdonipassport sh -c "mkdir -p files/bb-crs && cp /data/local/tmp/bn254_g1.dat /data/local/tmp/bn254_g2.dat /data/local/tmp/grumpkin_g1.flat.dat files/bb-crs/"'
```
Then `ensureCrsFilesForCircuits` logs "CRS files already satisfy… skipping network".

### Fast native-only rebuild (iterating on the JNI/overlay without the ~15 min full build)
Build a derived image `FROM vocdoni-passport-android-debug` that re-runs only the JNI clang++ compile (the `.so`s) + `gradlew assembleDebug` (bb/acvm stay cached). It reuses the base image's debug keystore, so `adb install -r` preserves app data (ID + pre-seeded CRS). See the migration history for the exact derived Dockerfile.

## Build/test entrypoints (CI)

`.github/workflows/ci.yml`: `npm ci` → `typecheck` → `lint` → `test`. `android-build.yml` / `ios-build.yml` are manual `workflow_dispatch` on self-hosted / macOS runners. The prover repo is fetched at `PROVER_REPO_REF` (default `main`); for local builds it uses the sibling `../vocdoni-passport-prover` if present.
