/**
 * On-device Noir/ACVM witness (compressed stack) via native Rust (Android JNI / iOS staticlib).
 */
import { Buffer } from 'buffer';
import { NativeModules } from 'react-native';
import RNFS from 'react-native-fs';

const { AcvmWitness } = NativeModules as { AcvmWitness?: { solveFromFile: (path: string) => Promise<string> } };

export function isAcvmWitnessAvailable(): boolean {
  return typeof AcvmWitness?.solveFromFile === 'function';
}

export type WitnessPayload = {
  /**
   * Same `bytecode` field as zkPassport packaged circuit JSON: base64 of the wire format
   * Noir uses for `Program::deserialize_program` (gzip-compressed program serialization).
   */
  bytecode: string;
  abi: unknown;
  debug_symbols?: string;
  file_map?: Record<string, unknown>;
  inputs: unknown;
};

/** Exported for unit tests (same serialization written to the native payload file). */
export function jsonStringifyPayloadForWitness(obj: unknown): string {
  return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? `0x${v.toString(16)}` : v));
}

/** Returns the same compressed witness bytes Barretenberg expects (from Noir.execute). */
export async function solveCompressedWitness(payload: WitnessPayload): Promise<Uint8Array> {
  if (!isAcvmWitnessAvailable()) {
    throw new Error('ACVM witness native module missing (AcvmWitness.solveFromFile)');
  }
  const path = `${RNFS.CachesDirectoryPath}/acvm_payload_${Date.now()}.json`;
  await RNFS.writeFile(path, jsonStringifyPayloadForWitness(payload), 'utf8');
  let ok = false;
  try {
    const b64 = await AcvmWitness!.solveFromFile(path);
    ok = true;
    return new Uint8Array(Buffer.from(b64, 'base64'));
  } catch (err: any) {
    // Keep the payload on disk for local reproduction (Rust CLI / adb pull) when witness solving fails.
    // This is intentionally noisy: it dramatically shortens the debug loop.
    const msg = err?.message || String(err);
    console.error(`[AcvmWitness] witness failed; payload saved at: ${path}`);
    throw new Error(`${msg} (payload saved at ${path})`);
  } finally {
    if (ok) {
      RNFS.unlink(path).catch(() => {});
    }
  }
}
