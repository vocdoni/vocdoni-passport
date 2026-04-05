# Vocdoni Passport - Build System
#
# This Makefile provides targets for building Android APK/AAB packages
# and utilities for development and testing.
#
# Usage:
#   make help          Show available targets
#   make apk           Build Android APK
#   make ios-info      Show iOS build instructions
#
# Copyright (c) 2024 Vocdoni Association
# SPDX-License-Identifier: AGPL-3.0-or-later

# Configuration
ROOT := .
DOCKER ?= docker
ADB ?= $(shell command -v adb 2>/dev/null || printf '%s' "adb")

# Prover dependency configuration
PROVER_REPO_LOCAL_DIR ?= ../vocdoni-passport-prover
PROVER_REPO_URL ?= https://github.com/vocdoni/vocdoni-passport-prover.git
PROVER_REPO_REF ?= main

# Directory structure
CACHE_DIR := .cache
FIXTURES_DIR := fixtures/real
OUT_DIR := out
VENDOR_PROVER_DIR := vendor/vocdoni-passport-prover

# Output paths
APK_PATH := $(OUT_DIR)/app-release.apk
AAB_PATH := $(OUT_DIR)/app-release.aab

# Docker image name
DOCKER_IMAGE ?= vocdoni-passport-android

.PHONY: help prepare prepare-prover-source apk aab apk-install apk-reset \
        apk-clean-install fixture-pull ios-info clean

# Default target
help:
	@printf '%s\n' \
		'Vocdoni Passport Build System' \
		'==============================' \
		'' \
		'Android (Docker-based, works on any OS):' \
		'  make apk               Build release APK' \
		'  make aab               Build App Bundle (for Play Store)' \
		'  make apk-install       Install APK on connected device' \
		'  make apk-reset         Clear app data on device' \
		'  make apk-clean-install Build, reset, and install' \
		'' \
		'iOS (requires macOS or GitHub Actions):' \
		'  make ios-info          Show iOS build instructions' \
		'' \
		'Development:' \
		'  make fixture-pull      Pull test fixture from device' \
		'  make clean             Remove build artifacts' \
		'' \
		'Configuration:' \
		'  PROVER_REPO_LOCAL_DIR  Path to local prover repo (default: ../vocdoni-passport-prover)' \
		'  PROVER_REPO_URL        Git URL for prover repo' \
		'  PROVER_REPO_REF        Git ref to checkout (default: main)'

ios-info:
	@printf '%s\n' \
		'' \
		'iOS Build Instructions' \
		'======================' \
		'' \
		'iOS apps cannot be built in Docker due to Apple licensing restrictions.' \
		'' \
		'Option 1: GitHub Actions (Recommended)' \
		'---------------------------------------' \
		'The repository includes a workflow that builds on macOS runners.' \
		'' \
		'Required secrets (configure in GitHub repository settings):' \
		'  IOS_DISTRIBUTION_CERTIFICATE_BASE64    Base64 .p12 certificate' \
		'  IOS_DISTRIBUTION_CERTIFICATE_PASSWORD  Certificate password' \
		'  IOS_PROVISIONING_PROFILE_BASE64        Base64 .mobileprovision' \
		'  KEYCHAIN_PASSWORD                      Temporary keychain password' \
		'  APPLE_TEAM_ID                          Apple Developer Team ID' \
		'' \
		'For TestFlight uploads, also configure:' \
		'  APP_STORE_CONNECT_API_KEY_ID           API Key ID' \
		'  APP_STORE_CONNECT_API_ISSUER_ID        Issuer ID' \
		'  APP_STORE_CONNECT_API_KEY_BASE64       Base64 .p8 key' \
		'' \
		'To trigger: Actions → iOS Build → Run workflow' \
		'' \
		'Option 2: Local macOS Build' \
		'---------------------------' \
		'Requirements: macOS, Xcode 16+, Rust 1.89+' \
		'' \
		'Steps:' \
		'  1. npm install --legacy-peer-deps' \
		'  2. cd ios && pod install && cd ..' \
		'  3. open ios/VocdoniPassport.xcworkspace' \
		'  4. Configure signing in Xcode' \
		'  5. Product → Archive' \
		'' \
		'See .github/workflows/ios-build.yml for details.'

# Prepare directories
prepare:
	@mkdir -p \
		$(CACHE_DIR) \
		$(FIXTURES_DIR) \
		$(OUT_DIR) \
		vendor

# Prepare prover source from local or remote
prepare-prover-source: prepare
	@rm -rf $(VENDOR_PROVER_DIR)
	@mkdir -p $(VENDOR_PROVER_DIR)
	@if [ -d "$(PROVER_REPO_LOCAL_DIR)/crates/acvm-witness-jni" ]; then \
		echo "Using local prover: $(PROVER_REPO_LOCAL_DIR)"; \
		cp "$(PROVER_REPO_LOCAL_DIR)/Cargo.toml" "$(VENDOR_PROVER_DIR)/Cargo.toml"; \
		cp "$(PROVER_REPO_LOCAL_DIR)/Cargo.lock" "$(VENDOR_PROVER_DIR)/Cargo.lock"; \
		cp -R "$(PROVER_REPO_LOCAL_DIR)/crates" "$(VENDOR_PROVER_DIR)/crates"; \
	else \
		echo "Cloning prover from $(PROVER_REPO_URL) @ $(PROVER_REPO_REF)"; \
		TMP_DIR=$$(mktemp -d); \
		git clone --depth 1 --branch "$(PROVER_REPO_REF)" "$(PROVER_REPO_URL)" "$$TMP_DIR/prover"; \
		cp "$$TMP_DIR/prover/Cargo.toml" "$(VENDOR_PROVER_DIR)/Cargo.toml"; \
		cp "$$TMP_DIR/prover/Cargo.lock" "$(VENDOR_PROVER_DIR)/Cargo.lock"; \
		cp -R "$$TMP_DIR/prover/crates" "$(VENDOR_PROVER_DIR)/crates"; \
		rm -rf "$$TMP_DIR"; \
	fi

# Build Android APK
apk: prepare-prover-source
	@echo "Building Android APK..."
	$(DOCKER) build \
		-f docker/apk.Dockerfile \
		--build-arg GRADLE_TASK=assembleRelease \
		-t $(DOCKER_IMAGE) \
		.
	@$(DOCKER) rm -f apk-extract 2>/dev/null || true
	$(DOCKER) create --name apk-extract $(DOCKER_IMAGE)
	$(DOCKER) cp apk-extract:/out/app-release.apk "$(APK_PATH)"
	$(DOCKER) rm -f apk-extract
	@echo ""
	@echo "APK ready: $(APK_PATH)"
	@ls -lh "$(APK_PATH)"

# Build Android App Bundle
aab: prepare-prover-source
	@echo "Building Android App Bundle..."
	$(DOCKER) build \
		-f docker/apk.Dockerfile \
		--build-arg GRADLE_TASK=bundleRelease \
		-t $(DOCKER_IMAGE) \
		.
	@$(DOCKER) rm -f apk-extract 2>/dev/null || true
	$(DOCKER) create --name apk-extract $(DOCKER_IMAGE)
	$(DOCKER) cp apk-extract:/out/app-release.aab "$(AAB_PATH)" 2>/dev/null || true
	$(DOCKER) rm -f apk-extract
	@echo ""
	@echo "AAB ready: $(AAB_PATH)"
	@ls -lh "$(AAB_PATH)" 2>/dev/null || echo "Warning: AAB not found"

# Install APK on connected device
apk-install:
	@test -f "$(APK_PATH)" || { echo "Error: $(APK_PATH) not found. Run 'make apk' first."; exit 1; }
	"$(ADB)" install -r "$(APK_PATH)"
	"$(ADB)" shell monkey -p com.vocdonipassport -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
	@echo "Installed: $(APK_PATH)"

# Clear app data on device
apk-reset:
	"$(ADB)" shell pm clear com.vocdonipassport
	"$(ADB)" shell am force-stop com.vocdonipassport
	@echo "App data cleared"

# Build, reset, and install
apk-clean-install: apk apk-reset apk-install

# Pull test fixture from device
fixture-pull: prepare
	@LATEST_DIR=$$("$(ADB)" shell ls /storage/emulated/0/Android/data/com.vocdonipassport/files/fixtures 2>/dev/null | tr -d '\r' | grep -v '^$$' | sort | tail -n1); \
	if [ -z "$$LATEST_DIR" ]; then \
		echo "Error: No fixtures found on device"; \
		exit 1; \
	fi; \
	echo "Pulling fixture: $$LATEST_DIR"; \
	"$(ADB)" pull "/storage/emulated/0/Android/data/com.vocdonipassport/files/fixtures/$$LATEST_DIR" "$(FIXTURES_DIR)/"; \
	ln -sfn "$$LATEST_DIR" "$(FIXTURES_DIR)/latest"; \
	echo "Fixture saved to: $(FIXTURES_DIR)/$$LATEST_DIR"

# Clean build artifacts
clean:
	rm -rf $(OUT_DIR)
	rm -rf $(VENDOR_PROVER_DIR)
	rm -rf $(CACHE_DIR)
	rm -rf node_modules
	rm -rf ios/Pods
	rm -rf ios/build
	rm -rf android/app/build
	rm -rf android/.gradle
	@echo "Build artifacts cleaned"
