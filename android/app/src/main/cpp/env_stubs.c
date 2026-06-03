/**
 * Stubs for world-state symbols referenced by libbarretenberg.a
 * but not used in the mobile proving path.
 *
 * bb 4.2 notes:
 *   - slow_low_memory, storage_budget, current_storage_usage are defined in
 *     backing_memory.cpp (compiled into libbarretenberg.a) — do NOT stub them here.
 *   - With MOBILE=ON, lmdb/world_state are excluded from libbarretenberg.a entirely.
 *   - libenv.a provides hardware_concurrency, logstr, throw_or_abort, data_store.
 */
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

/*
 * bb 4.2 with MOBILE=ON excludes the Aztec-VM (AVM2) implementation, but the
 * acir_format recursion-constraint dispatch compiled into the JNI still carries an
 * (unreached) reference to:
 *   acir_format::create_avm2_recursion_constraints_goblin(
 *       bb::UltraCircuitBuilder_<bb::UltraExecutionTraceBlocks>&,
 *       acir_format::RecursionConstraint const&)
 * The mobile app only proves non-AVM inner circuits, so this is never called.
 * Define the mangled symbol (C linkage = no re-mangling) so libbarretenberg_jni.so
 * resolves all symbols at dlopen. If it were ever reached, abort loudly.
 */
/*
 * extern "C" so the symbol name is emitted verbatim (this translation unit is
 * compiled by the clang++ driver, which would otherwise C++-mangle the identifier).
 */
#ifdef __cplusplus
extern "C" {
#endif
void _ZN11acir_format40create_avm2_recursion_constraints_goblinERN2bb20UltraCircuitBuilder_INS0_25UltraExecutionTraceBlocksEEERKNS_19RecursionConstraintE(void);
void _ZN11acir_format40create_avm2_recursion_constraints_goblinERN2bb20UltraCircuitBuilder_INS0_25UltraExecutionTraceBlocksEEERKNS_19RecursionConstraintE(void) {
    abort();
}
#ifdef __cplusplus
}
#endif
