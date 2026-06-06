/**
 * Circuit-registry Merkle proofs, built ONCE per manifest.
 *
 * The zkPassport SDK's `getCircuitMerkleProof` rebuilds the entire ~790-leaf
 * poseidon2 tree on every call. For a sign with N inner circuits that is N full
 * tree builds (~3-5s each in Hermes). This module builds the tree a single time
 * and derives every circuit's path from it (each createProof is O(depth)=12).
 *
 * Safety: the tree implementation is self-checked at runtime against the SDK's
 * own `getCircuitMerkleProof` for one circuit per manifest. If the root/path do
 * not match (e.g. an SDK upgrade changes the tree shape), we fall back to the
 * SDK for every circuit, so the on-chain-registry paths can never be wrong.
 */
import {
  CIRCUIT_REGISTRY_HEIGHT,
  MERKLE_TREE_ZERO_VALUE,
  getCircuitMerkleProof,
  getLeavesFromCircuitManifest,
} from '@zkpassport/utils';
import { poseidon2Hash } from '@zkpassport/poseidon2';

export type MerkleProof = { path: string[]; index: number };

// Normalize a field element to the SDK's hex form (lowercase, 0x, even length).
function toHex(value: bigint): string {
  const e = value.toString(16);
  return `0x${e.padStart(e.length % 2 ? e.length + 1 : e.length, '0')}`;
}

// Minimal fixed-arity-2 incremental Merkle tree matching the SDK's IMT
// (zero value padded per level, siblings collected bottom-up).
class PoseidonIMT {
  private zeroes: bigint[] = [];
  private nodes: bigint[][] = [];
  constructor(private depth: number, zero: bigint, leaves: bigint[]) {
    this.zeroes[0] = zero;
    for (let i = 1; i <= depth; i++) {
      this.zeroes[i] = poseidon2Hash([this.zeroes[i - 1], this.zeroes[i - 1]]);
    }
    this.nodes[0] = leaves.slice();
    for (let i = 1; i <= depth; i++) {
      const prev = this.nodes[i - 1];
      const cur: bigint[] = [];
      for (let j = 0; j < Math.ceil(prev.length / 2); j++) {
        const left = prev[2 * j];
        const right = 2 * j + 1 < prev.length ? prev[2 * j + 1] : this.zeroes[i - 1];
        cur.push(poseidon2Hash([left, right]));
      }
      this.nodes[i] = cur;
    }
  }
  get root(): bigint {
    const top = this.nodes[this.depth];
    return top.length > 0 ? top[0] : this.zeroes[this.depth];
  }
  createProof(index: number): MerkleProof {
    const path: string[] = [];
    let idx = index;
    for (let i = 0; i < this.depth; i++) {
      const level = this.nodes[i];
      const sibIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      const sibling = sibIdx < level.length ? level[sibIdx] : this.zeroes[i];
      path.push(toHex(sibling));
      idx = Math.floor(idx / 2);
    }
    return { path, index };
  }
}

type CachedTree = { tree: PoseidonIMT; leaves: bigint[]; verified: boolean; usable: boolean };
const treeCache = new Map<string, CachedTree>();

async function buildAndVerify(manifest: any): Promise<CachedTree> {
  const key = String(manifest?.root || '');
  const existing = treeCache.get(key);
  if (existing) {return existing;}

  const leaves = getLeavesFromCircuitManifest(manifest);
  const tree = new PoseidonIMT(Number(CIRCUIT_REGISTRY_HEIGHT), BigInt(MERKLE_TREE_ZERO_VALUE), leaves);

  // Self-check against the SDK on the first available circuit hash.
  let usable = true;
  let verified = false;
  const sampleHash = Object.values(manifest?.circuits || {})
    .map((c: any) => String(c?.hash || ''))
    .find((h) => leaves.indexOf(BigInt(h)) >= 0);
  if (sampleHash) {
    try {
      const mine = tree.createProof(leaves.indexOf(BigInt(sampleHash)));
      const sdk = await getCircuitMerkleProof(sampleHash, manifest);
      const sdkPath = sdk.path.map((x: any) => (typeof x === 'string' ? x : toHex(BigInt(x))));
      const same =
        mine.index === sdk.index &&
        mine.path.length === sdkPath.length &&
        mine.path.every((p, i) => p === sdkPath[i]);
      usable = same;
      verified = same;
      if (!same) {
        console.warn('[circuitMerkle] local IMT disagrees with SDK; falling back to SDK per-circuit');
      }
    } catch (e) {
      usable = false;
      console.warn(`[circuitMerkle] self-check failed (${String(e)}); falling back to SDK`);
    }
  } else {
    usable = false; // can't verify -> don't trust it
  }

  const entry: CachedTree = { tree, leaves, verified, usable };
  treeCache.set(key, entry);
  return entry;
}

/** Merkle proof for one circuit, using the cached single tree (SDK fallback if unverifiable). */
export async function circuitMerkleProof(manifest: any, circuitHash: string): Promise<MerkleProof> {
  const entry = await buildAndVerify(manifest);
  if (entry.usable) {
    const idx = entry.leaves.indexOf(BigInt(circuitHash));
    if (idx >= 0) {return entry.tree.createProof(idx);}
  }
  const sdk = await getCircuitMerkleProof(circuitHash, manifest);
  return {
    path: sdk.path.map((x: any) => (typeof x === 'string' ? x : toHex(BigInt(x)))),
    index: sdk.index,
  };
}
