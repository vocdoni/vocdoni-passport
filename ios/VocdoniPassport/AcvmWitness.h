/**
 * AcvmWitness - React Native bridge for ACVM witness solving
 *
 * This module provides native bindings to the Rust ACVM witness solver,
 * enabling zero-knowledge proof witness generation on iOS devices.
 *
 * The module exposes two methods to JavaScript:
 *   - solveFromFile: Reads a JSON payload from disk and solves the witness
 *   - solveFromJson: Takes a JSON string directly and solves the witness
 *
 * Both methods return a base64-encoded compressed witness suitable for
 * use with Barretenberg proof generation.
 *
 * Copyright (c) 2024 Vocdoni Association
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

#import <React/RCTBridgeModule.h>

@interface AcvmWitness : NSObject <RCTBridgeModule>
@end
