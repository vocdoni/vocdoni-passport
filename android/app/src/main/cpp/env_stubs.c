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

/* No additional stubs needed for bb 4.2 MOBILE builds. */
