import pako from 'pako';
import { normalizeRegistryBytecodeToAcirBase64 } from '../witnessBytecode';

describe('normalizeRegistryBytecodeToAcirBase64', () => {
  it('passes through raw ACIR base64', () => {
    const raw = Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0xab]);
    const b64 = raw.toString('base64');
    expect(normalizeRegistryBytecodeToAcirBase64(b64)).toBe(b64);
  });

  it('unwraps registry-style gzip layer', () => {
    const raw = Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xee]);
    const gz = Buffer.from(pako.gzip(new Uint8Array(raw)));
    const registryB64 = gz.toString('base64');
    expect(normalizeRegistryBytecodeToAcirBase64(registryB64)).toBe(raw.toString('base64'));
  });
});
