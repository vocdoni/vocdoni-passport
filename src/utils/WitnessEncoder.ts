/**
 * Witness Encoder
 *
 * Encodes circuit inputs into ACIR WitnessStack bincode expected by barretenberg.
 *
 * Important findings from local repro:
 * - bbapi accepts ACIR witness stack in bincode/msgpack, but the reliable format here is bincode
 * - witness indices are zero-based in Noir ABI encoding
 * - each witness value is serialized as Vec<u8> with length 32
 *
 * Layout:
 *   WitnessStack { stack: Vec<StackItem> }
 *   StackItem { index: u32, witness: WitnessMap }
 *   WitnessMap { value: Map<Witness,u8[32]> }
 */

export interface CircuitABI {
  parameters: Array<{ name: string; type: any; visibility: string }>;
}

function typeFieldCount(type: any): number {
  if (!type) {return 1;}
  const kind = type.kind;
  if (kind === 'field' || kind === 'boolean' || kind === 'integer') {return 1;}
  if (kind === 'string') {return type.length || 1;}
  if (kind === 'array') {return (type.length || 0) * typeFieldCount(type.type);}
  if (kind === 'struct') {
    return (type.fields || []).reduce((sum: number, f: any) => sum + typeFieldCount(f.type), 0);
  }
  if (kind === 'tuple') {
    return (type.fields || []).reduce((sum: number, f: any) => sum + typeFieldCount(f), 0);
  }
  return 1;
}

export function encodeWitness(abi: CircuitABI | undefined, inputs: Record<string, any>): Uint8Array {
  const witnessEntries: Array<[number, Uint8Array]> = [];

  if (!abi?.parameters) {
    let idx = 0;
    for (const key of Object.keys(inputs)) {
      const fields = flattenToFields(inputs[key]);
      for (const f of fields) {witnessEntries.push([idx++, normalizeFieldBytes(f)]);}
    }
  } else {
    let idx = 0;
    for (const param of abi.parameters) {
      const value = inputs[param.name];
      const expectedCount = typeFieldCount(param.type);
      const fields = value === undefined || value === null ? [] : flattenToFields(value);
      for (let i = 0; i < expectedCount; i++) {
        witnessEntries.push([idx++, normalizeFieldBytes(i < fields.length ? fields[i] : field(0n))]);
      }
    }
  }

  return serializeWitnessStackBincode(witnessEntries);
}

function serializeWitnessStackBincode(entries: Array<[number, Uint8Array]>): Uint8Array {
  const out: number[] = [];

  const u32 = (n: number) => {
    out.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
  };
  const u64 = (n: number | bigint) => {
    let v = BigInt(n);
    for (let i = 0; i < 8; i++) {
      out.push(Number(v & 0xffn));
      v >>= 8n;
    }
  };
  const bytes = (buf: Uint8Array) => {
    for (const b of buf) {out.push(b);}
  };

  // WitnessStack.stack: Vec<StackItem> len = 1
  u64(1);
  // StackItem.index
  u32(0);
  // WitnessMap.value: Map<Witness, Vec<u8>>
  u64(entries.length);
  for (const [idx, value] of entries) {
    u32(idx);
    u64(value.length);
    bytes(value);
  }

  return Uint8Array.from(out);
}

function flattenToFields(value: any): Uint8Array[] {
  if (value === null || value === undefined) {return [field(0n)];}
  if (typeof value === 'boolean') {return [field(value ? 1n : 0n)];}
  if (typeof value === 'number') {return [field(BigInt(value))];}
  if (typeof value === 'bigint') {return [field(value)];}
  if (typeof value === 'string') {
    if (value.startsWith('0x') || value.startsWith('0X')) {return [field(BigInt(value))];}
    try {
      return [field(BigInt(value))];
    } catch {
      return Array.from(new TextEncoder().encode(value)).map((x) => field(BigInt(x)));
    }
  }
  if (value instanceof Uint8Array) {
    if (value.length <= 32) {return [normalizeFieldBytes(value)];}
    const out: Uint8Array[] = [];
    for (let i = 0; i < value.length; i += 31) {
      const chunk = value.slice(i, Math.min(i + 31, value.length));
      out.push(normalizeFieldBytes(chunk));
    }
    return out;
  }
  if (Array.isArray(value)) {return value.flatMap(v => flattenToFields(v));}
  if (typeof value === 'object') {return Object.values(value).flatMap(v => flattenToFields(v));}
  return [field(0n)];
}

function normalizeFieldBytes(value: Uint8Array): Uint8Array {
  if (value.length === 32) {return value;}
  const out = new Uint8Array(32);
  out.set(value.slice(Math.max(0, value.length - 32)), Math.max(0, 32 - value.length));
  return out;
}

function field(n: bigint): Uint8Array {
  const f = new Uint8Array(32);
  let v = n < 0n ? -n : n;
  for (let i = 31; i >= 0; i--) {
    f[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return f;
}
