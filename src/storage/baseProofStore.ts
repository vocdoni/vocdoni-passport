/**
 * Disk persistence for the per-passport base proofs (DSC / ID-data / integrity).
 *
 * These proofs are petition-agnostic and expensive (~41s to build). In RN's
 * bridgeless deeplink model most signs start a fresh process, so an in-memory
 * cache rarely survives between signs — persisting lets a cold-start re-sign of
 * the same passport skip base input-building + proving entirely.
 *
 * Stored in EncryptedStorage (the salts are privacy-sensitive). Keyed by a
 * passport id; each entry carries the full `baseKey` (passport + manifest
 * version + cert root + circuit names) so a registry/cert change invalidates it
 * automatically. Bounded to the most recent few passports.
 */
import EncryptedStorage from 'react-native-encrypted-storage';

const KEY = 'base_proofs_v1';
const MAX_IDS = 4;

type SaltsOut = { dg1Salt: bigint; expiryDateSalt: bigint; dg2HashSalt: bigint; privateNullifierSalt: bigint };

export type PersistableBaseProofs = {
  saltDscIn: bigint;
  saltsOut: SaltsOut;
  dsc: any;
  idData: any;
  integrity: any;
};

function serSalts(s: SaltsOut) {
  return {
    dg1Salt: s.dg1Salt.toString(),
    expiryDateSalt: s.expiryDateSalt.toString(),
    dg2HashSalt: s.dg2HashSalt.toString(),
    privateNullifierSalt: s.privateNullifierSalt.toString(),
  };
}

function deSalts(s: any): SaltsOut {
  return {
    dg1Salt: BigInt(s.dg1Salt),
    expiryDateSalt: BigInt(s.expiryDateSalt),
    dg2HashSalt: BigInt(s.dg2HashSalt),
    privateNullifierSalt: BigInt(s.privateNullifierSalt),
  };
}

/** Returns the cached base proofs if present AND still valid for this baseKey. */
export async function loadBaseProofs(idKey: string, baseKey: string): Promise<PersistableBaseProofs | null> {
  try {
    const raw = await EncryptedStorage.getItem(KEY);
    if (!raw) {return null;}
    const map = JSON.parse(raw);
    const e = map?.[idKey];
    if (!e || e.baseKey !== baseKey) {return null;} // absent or stale (manifest/cert/circuits changed)
    return { saltDscIn: BigInt(e.saltDscIn), saltsOut: deSalts(e.saltsOut), dsc: e.dsc, idData: e.idData, integrity: e.integrity };
  } catch {
    return null;
  }
}

/** Persist base proofs for a passport (best-effort; failures are non-fatal). */
export async function saveBaseProofs(idKey: string, baseKey: string, entry: PersistableBaseProofs): Promise<void> {
  try {
    const raw = await EncryptedStorage.getItem(KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[idKey] = {
      baseKey,
      ts: Date.now(),
      saltDscIn: entry.saltDscIn.toString(),
      saltsOut: serSalts(entry.saltsOut),
      dsc: entry.dsc,
      idData: entry.idData,
      integrity: entry.integrity,
    };
    const keys = Object.keys(map);
    if (keys.length > MAX_IDS) {
      keys.sort((a, b) => (map[a]?.ts || 0) - (map[b]?.ts || 0));
      for (const k of keys.slice(0, keys.length - MAX_IDS)) {delete map[k];}
    }
    await EncryptedStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // best-effort cache; ignore
  }
}
