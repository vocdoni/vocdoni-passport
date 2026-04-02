#pragma once
// Android bionic libc doesn't provide aligned_alloc until API 28.
// This header provides a drop-in replacement using posix_memalign.
#ifdef __ANDROID__
#ifdef __cplusplus
#include <cstdlib>
#include <cstddef>
#else
#include <stdlib.h>
#include <stddef.h>
#endif

// Only define if not already provided by the system
#if __ANDROID_API__ < 28

static inline void* __bb_android_aligned_alloc(size_t alignment, size_t size) {
    // aligned_alloc requires size to be a multiple of alignment
    if (size % alignment != 0) {
        size += alignment - (size % alignment);
    }
    void* ptr = NULL;
    if (posix_memalign(&ptr, alignment, size) != 0) {
        return NULL;
    }
    return ptr;
}

// Replace all uses of aligned_alloc
#define aligned_alloc __bb_android_aligned_alloc

#endif // __ANDROID_API__ < 28
#endif // __ANDROID__
