#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
  uint8_t *ptr;
  size_t len;
} AcvmWitnessBuffer;

typedef struct {
  uint32_t status; /* 0 = ok (data), non-zero = error (error_utf8) */
  AcvmWitnessBuffer data;
  char *error_utf8;
} AcvmWitnessFfiResult;

AcvmWitnessFfiResult acvm_witness_solve_json_utf8(const uint8_t *json_ptr, size_t json_len);
void acvm_witness_free_ffi_result(AcvmWitnessFfiResult r);

#ifdef __cplusplus
}
#endif
