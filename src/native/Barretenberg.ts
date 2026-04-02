/**
 * Barretenberg Native Bridge
 * Talks to native bbapi via JNI using msgpack encoding.
 */
import { NativeModules } from 'react-native';
import { encode, decode } from '@msgpack/msgpack';
import { Buffer } from 'buffer';

const { Barretenberg } = NativeModules;

export function isAvailable(): boolean {
  return !!Barretenberg;
}

/** Sync native CRS_PATH + rebind CRS factories (call after CRS files exist on disk). */
export function setBbCrsPath(path: string): void {
  const mod = Barretenberg as { setCrsPath?: (p: string) => void } | undefined;
  if (path && mod?.setCrsPath) {
    mod.setCrsPath(path);
  }
}

async function callBbapi(encoded: Uint8Array): Promise<any> {
  if (!Barretenberg) throw new Error('Barretenberg native module not loaded');
  const inputB64 = Buffer.from(encoded).toString('base64');
  const outputB64: string = await Barretenberg.bbapi(inputB64);
  const outputBytes = new Uint8Array(Buffer.from(outputB64, 'base64'));
  const decoded = decode(outputBytes) as any;

  // Seen variants across bbapi/schema versions:
  // 1) [["CircuitProveResponse", { ... }]]
  // 2) ["CircuitProveResponse", { ... }]
  // 3) { public_inputs, proof, vk }
  // 4) { name, data }
  if (Array.isArray(decoded) && decoded.length >= 1 && Array.isArray(decoded[0]) && decoded[0].length >= 2) {
    return { name: decoded[0][0], data: decoded[0][1] };
  }
  if (Array.isArray(decoded) && decoded.length >= 2 && typeof decoded[0] === 'string') {
    return { name: decoded[0], data: decoded[1] };
  }
  if (decoded && typeof decoded === 'object' && 'name' in decoded && 'data' in decoded) {
    return decoded;
  }
  return { name: undefined, data: decoded };
}

export async function circuitProve(
  bytecode: Uint8Array,
  witness: Uint8Array,
  vk: Uint8Array = new Uint8Array(0),
  name: string = 'circuit',
): Promise<{ public_inputs: any[]; proof: any[]; vk: any }> {
  const cmd = encode([
    ['CircuitProve', {
      circuit: { name, bytecode, verification_key: vk },
      witness,
      settings: {
        ipa_accumulation: false,
        oracle_hash_type: 'poseidon2',
        disable_zk: false,
        optimized_solidity_verifier: false,
      },
    }],
  ]);
  const resp = await callBbapi(cmd);
  const data = resp?.data ?? resp;
  if (!data || typeof data !== 'object') {
    throw new Error(`Invalid CircuitProve response shape: ${typeof data}`);
  }
  if (!('proof' in data) || !('public_inputs' in data)) {
    throw new Error(`CircuitProve response missing proof/public_inputs keys: ${Object.keys(data).join(',')}`);
  }
  return data;
}

export async function circuitVerify(
  vk: Uint8Array,
  proof: any[],
  publicInputs: any[],
): Promise<boolean> {
  const cmd = encode([
    ['CircuitVerify', {
      verification_key: vk,
      public_inputs: publicInputs,
      proof,
      settings: {
        ipa_accumulation: false,
        oracle_hash_type: 'poseidon2',
        disable_zk: false,
        optimized_solidity_verifier: false,
      },
    }],
  ]);
  const resp = await callBbapi(cmd);
  return resp.data?.verified ?? false;
}
