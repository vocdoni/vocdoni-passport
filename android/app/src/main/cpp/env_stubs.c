/**
 * Stubs for world-state symbols referenced by libbarretenberg.a
 * but not used in the mobile proving path.
 * NOTE: slow_low_memory, storage_budget, verbose_logging are in libenv.a
 */
#include <stddef.h>
#include <stdint.h>

size_t current_storage_usage(void) { return 0; }
