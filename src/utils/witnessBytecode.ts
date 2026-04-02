import pako from 'pako';

/**
 * Registry packaged circuits may ship `bytecode` as base64(gzip(program)) or base64(program).
 * Use this when a consumer needs the **decompressed** program bytes (e.g. custom tooling).
 *
 * Do **not** use this for `solveCompressedWitness` / native ACVM: `Program::deserialize_program`
 * expects the gzip-wrapped bytes; pass registry `bytecode` unchanged instead.
 */
export function normalizeRegistryBytecodeToAcirBase64(registryBase64: string): string {
  const buf = Buffer.from(registryBase64, 'base64');
  const raw =
    buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b
      ? Buffer.from(pako.ungzip(new Uint8Array(buf)))
      : buf;
  return raw.toString('base64');
}
