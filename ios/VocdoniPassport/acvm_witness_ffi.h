/**
 * ACVM Witness FFI - C interface to Rust witness solver
 *
 * This header defines the C-compatible interface for the Rust ACVM
 * witness solver library. The library is built from the
 * vocdoni-passport-prover repository and linked statically.
 *
 * Copyright (c) 2024 Vocdoni Association
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Buffer containing witness data.
 */
typedef struct {
  uint8_t *ptr;  /** Pointer to data (may be NULL) */
  size_t len;    /** Length of data in bytes */
} AcvmWitnessBuffer;

/**
 * Result from witness solving operation.
 */
typedef struct {
  uint32_t status;         /** 0 = success, non-zero = error */
  AcvmWitnessBuffer data;  /** Witness data on success */
  char *error_utf8;        /** Error message on failure (UTF-8) */
} AcvmWitnessFfiResult;

/**
 * Solve witness from a JSON payload.
 *
 * @param json_ptr Pointer to UTF-8 encoded JSON payload
 * @param json_len Length of JSON payload in bytes
 * @return Result containing witness data or error message
 *
 * The caller must free the result using acvm_witness_free_ffi_result().
 */
AcvmWitnessFfiResult acvm_witness_solve_json_utf8(
    const uint8_t *json_ptr,
    size_t json_len
);

/**
 * Free memory allocated by acvm_witness_solve_json_utf8().
 *
 * @param r Result to free
 */
void acvm_witness_free_ffi_result(AcvmWitnessFfiResult r);

#ifdef __cplusplus
}
#endif
