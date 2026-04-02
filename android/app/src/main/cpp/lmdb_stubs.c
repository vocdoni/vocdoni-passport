/**
 * Stub implementations for LMDB functions.
 *
 * Barretenberg's static library includes lmdblib object files that reference
 * these symbols. However, the mobile proving/verification path never calls
 * any LMDB functions (they're only used by Aztec's world_state module).
 *
 * These stubs satisfy the linker without needing to cross-compile LMDB
 * for Android.
 */
#include <stddef.h>
#include <stdlib.h>

/* Opaque types */
typedef struct MDB_env MDB_env;
typedef struct MDB_txn MDB_txn;
typedef struct MDB_cursor MDB_cursor;
typedef unsigned int MDB_dbi;
typedef struct { size_t mv_size; void *mv_data; } MDB_val;
typedef struct { size_t ms_psize; unsigned int ms_depth; size_t ms_branch_pages;
    size_t ms_leaf_pages; size_t ms_overflow_pages; size_t ms_entries; } MDB_stat;
typedef struct { size_t me_mapaddr; size_t me_mapsize; size_t me_last_pgno;
    size_t me_last_txnid; unsigned int me_maxreaders; unsigned int me_numreaders; } MDB_envinfo;
typedef int (*MDB_cmp_func)(const MDB_val *a, const MDB_val *b);

int mdb_env_create(MDB_env **env) { (void)env; abort(); return -1; }
int mdb_env_open(MDB_env *env, const char *path, unsigned int flags, int mode)
    { (void)env;(void)path;(void)flags;(void)mode; abort(); return -1; }
void mdb_env_close(MDB_env *env) { (void)env; abort(); }
int mdb_env_set_mapsize(MDB_env *env, size_t size) { (void)env;(void)size; abort(); return -1; }
int mdb_env_set_maxdbs(MDB_env *env, MDB_dbi dbs) { (void)env;(void)dbs; abort(); return -1; }
int mdb_env_set_maxreaders(MDB_env *env, unsigned int readers) { (void)env;(void)readers; abort(); return -1; }
int mdb_env_copy2(MDB_env *env, const char *path, unsigned int flags)
    { (void)env;(void)path;(void)flags; abort(); return -1; }
int mdb_env_info(MDB_env *env, MDB_envinfo *stat) { (void)env;(void)stat; abort(); return -1; }
int mdb_txn_begin(MDB_env *env, MDB_txn *parent, unsigned int flags, MDB_txn **txn)
    { (void)env;(void)parent;(void)flags;(void)txn; abort(); return -1; }
int mdb_txn_commit(MDB_txn *txn) { (void)txn; abort(); return -1; }
void mdb_txn_abort(MDB_txn *txn) { (void)txn; abort(); }
int mdb_dbi_open(MDB_txn *txn, const char *name, unsigned int flags, MDB_dbi *dbi)
    { (void)txn;(void)name;(void)flags;(void)dbi; abort(); return -1; }
void mdb_dbi_close(MDB_env *env, MDB_dbi dbi) { (void)env;(void)dbi; abort(); }
int mdb_get(MDB_txn *txn, MDB_dbi dbi, MDB_val *key, MDB_val *data)
    { (void)txn;(void)dbi;(void)key;(void)data; abort(); return -1; }
int mdb_put(MDB_txn *txn, MDB_dbi dbi, MDB_val *key, MDB_val *data, unsigned int flags)
    { (void)txn;(void)dbi;(void)key;(void)data;(void)flags; abort(); return -1; }
int mdb_del(MDB_txn *txn, MDB_dbi dbi, MDB_val *key, MDB_val *data)
    { (void)txn;(void)dbi;(void)key;(void)data; abort(); return -1; }
int mdb_cursor_open(MDB_txn *txn, MDB_dbi dbi, MDB_cursor **cursor)
    { (void)txn;(void)dbi;(void)cursor; abort(); return -1; }
void mdb_cursor_close(MDB_cursor *cursor) { (void)cursor; abort(); }
int mdb_cursor_get(MDB_cursor *cursor, MDB_val *key, MDB_val *data, int op)
    { (void)cursor;(void)key;(void)data;(void)op; abort(); return -1; }
int mdb_cmp(MDB_txn *txn, MDB_dbi dbi, const MDB_val *a, const MDB_val *b)
    { (void)txn;(void)dbi;(void)a;(void)b; abort(); return 0; }
int mdb_set_compare(MDB_txn *txn, MDB_dbi dbi, MDB_cmp_func cmp)
    { (void)txn;(void)dbi;(void)cmp; abort(); return -1; }
int mdb_stat(MDB_txn *txn, MDB_dbi dbi, MDB_stat *stat)
    { (void)txn;(void)dbi;(void)stat; abort(); return -1; }
char *mdb_strerror(int err) { (void)err; return "lmdb not available on mobile"; }
