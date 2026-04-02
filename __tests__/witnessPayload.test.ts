jest.mock('react-native', () => ({ NativeModules: {} }));
jest.mock('react-native-fs', () => ({}));

import { jsonStringifyPayloadForWitness } from '../src/native/AcvmWitness';

describe('witness payload JSON', () => {
  it('stringifies bigint as hex', () => {
    const s = jsonStringifyPayloadForWitness({ x: 1n, y: '0x2a' });
    const o = JSON.parse(s);
    expect(o.x).toBe('0x1');
    expect(o.y).toBe('0x2a');
  });
});
