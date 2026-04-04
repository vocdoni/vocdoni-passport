ROOT := .
DOCKER ?= docker
UID := $(shell id -u)
GID := $(shell id -g)
APK_IMAGE ?= vocdoni-passport-apk
ADB ?= $(shell command -v adb 2>/dev/null || printf '%s' "adb")

PROVER_REPO_LOCAL_DIR ?= ../vocdoni-passport-prover
PROVER_REPO_URL ?= https://github.com/vocdoni/vocdoni-passport-prover.git
PROVER_REPO_REF ?= main

CACHE_DIR := .cache
FIXTURES_DIR := fixtures/real
OUT_DIR := out/apk
VENDOR_PROVER_DIR := vendor/vocdoni-passport-prover
APK_PATH := $(OUT_DIR)/app-release.apk

.PHONY: help prepare prepare-prover-source apk aab apk-install apk-reset apk-clean-install fixture-pull

help:
	@printf '%s\n' \
		'Available targets:' \
		'  make apk               Build the Android release APK (optimized, arm64 only)' \
		'  make aab               Build Android App Bundle (for Play Store)' \
		'  make apk-install       Install the built APK with host adb' \
		'  make apk-reset         Clear app storage and stop the app on the device' \
		'  make apk-clean-install Build, install, and reset app storage' \
		'  make fixture-pull      Pull the latest fixture from a connected device'

prepare:
	mkdir -p \
		$(CACHE_DIR)/cargo \
		$(CACHE_DIR)/gradle \
		$(CACHE_DIR)/home/android \
		$(CACHE_DIR)/npm \
		$(CACHE_DIR)/rustup \
		$(FIXTURES_DIR) \
		$(OUT_DIR) \
		vendor

prepare-prover-source: prepare
	rm -rf $(VENDOR_PROVER_DIR)
	mkdir -p $(VENDOR_PROVER_DIR)
	if [ -d "$(PROVER_REPO_LOCAL_DIR)/crates/acvm-witness-jni" ]; then \
		cp "$(PROVER_REPO_LOCAL_DIR)/Cargo.toml" "$(VENDOR_PROVER_DIR)/Cargo.toml"; \
		cp "$(PROVER_REPO_LOCAL_DIR)/Cargo.lock" "$(VENDOR_PROVER_DIR)/Cargo.lock"; \
		cp -R "$(PROVER_REPO_LOCAL_DIR)/crates" "$(VENDOR_PROVER_DIR)/crates"; \
	else \
		TMP_DIR=`mktemp -d`; \
		git clone --depth 1 --branch "$(PROVER_REPO_REF)" "$(PROVER_REPO_URL)" "$$TMP_DIR/vocdoni-passport-prover"; \
		cp "$$TMP_DIR/vocdoni-passport-prover/Cargo.toml" "$(VENDOR_PROVER_DIR)/Cargo.toml"; \
		cp "$$TMP_DIR/vocdoni-passport-prover/Cargo.lock" "$(VENDOR_PROVER_DIR)/Cargo.lock"; \
		cp -R "$$TMP_DIR/vocdoni-passport-prover/crates" "$(VENDOR_PROVER_DIR)/crates"; \
		rm -rf "$$TMP_DIR"; \
	fi

apk: prepare-prover-source
	$(DOCKER) build \
		-f docker/apk.Dockerfile \
		--build-arg GRADLE_TASK=assembleRelease \
		-t $(APK_IMAGE) \
		.
	$(DOCKER) create --name apk-extract $(APK_IMAGE) 2>/dev/null || \
		($(DOCKER) rm -f apk-extract && $(DOCKER) create --name apk-extract $(APK_IMAGE))
	$(DOCKER) cp apk-extract:/out/app-release.apk "$(APK_PATH)"
	$(DOCKER) rm -f apk-extract
	@printf 'APK ready:\n%s\n' '$(APK_PATH)'
	@ls -lh "$(APK_PATH)"

aab: prepare-prover-source
	$(DOCKER) build \
		-f docker/apk.Dockerfile \
		--build-arg GRADLE_TASK=bundleRelease \
		-t $(APK_IMAGE) \
		.
	$(DOCKER) create --name apk-extract $(APK_IMAGE) 2>/dev/null || \
		($(DOCKER) rm -f apk-extract && $(DOCKER) create --name apk-extract $(APK_IMAGE))
	$(DOCKER) cp apk-extract:/out/app-release.aab "$(OUT_DIR)/app-release.aab" 2>/dev/null || true
	$(DOCKER) rm -f apk-extract
	@printf 'AAB ready:\n%s\n' '$(OUT_DIR)/app-release.aab'
	@ls -lh "$(OUT_DIR)/app-release.aab" 2>/dev/null || true

apk-install:
	test -f "$(APK_PATH)"
	"$(ADB)" install -r "$(APK_PATH)"
	"$(ADB)" shell monkey -p com.vocdonipassport -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
	@printf 'Installed:\n%s\n' '$(APK_PATH)'

apk-reset:
	"$(ADB)" shell pm clear com.vocdonipassport
	"$(ADB)" shell am force-stop com.vocdonipassport

apk-clean-install: apk apk-reset apk-install

fixture-pull: prepare
	LATEST_DIR=`"$(ADB)" shell ls /storage/emulated/0/Android/data/com.vocdonipassport/files/fixtures 2>/dev/null | tr -d '\r' | grep -v '^$$' | sort | tail -n1`; \
	test -n "$$LATEST_DIR"; \
	echo "Pulling /storage/emulated/0/Android/data/com.vocdonipassport/files/fixtures/$$LATEST_DIR"; \
	"$(ADB)" pull "/storage/emulated/0/Android/data/com.vocdonipassport/files/fixtures/$$LATEST_DIR" "$(FIXTURES_DIR)/"; \
	ln -sfn "$$LATEST_DIR" "$(FIXTURES_DIR)/latest"; \
	printf 'Fixture copied to:\n%s\n' "$(FIXTURES_DIR)/$$LATEST_DIR"
