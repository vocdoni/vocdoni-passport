jest.mock('@zkpassport/utils', () => ({
  getCommitmentOutFromIntegrityProof: ({ publicInputs }: { publicInputs: string[] }) =>
    BigInt(publicInputs[publicInputs.length - 1]),
  getCommitmentInFromDisclosureProof: ({ publicInputs }: { publicInputs: string[] }) =>
    BigInt(publicInputs[0]),
}));

import { assertDisclosureCommInMatchesIntegrityOut } from '../src/services/proofCommitmentAssertions';

describe('assertDisclosureCommInMatchesIntegrityOut', () => {
  const integOut =
    '0x27b5b1e4a72a26ecd26e3e7e87b5d8feacc3297f3d791857da107ee5d25927df';
  const integIn =
    '0x2b0626d3b8a7a48e441a5c37401cfe17445063bdaa2bd49eaf8037c65a24eb0c';

  it('passes when disclosure PI[0] equals integrity comm_out', () => {
    expect(() =>
      assertDisclosureCommInMatchesIntegrityOut(
        'disclose_bytes_evm',
        [integIn, integOut],
        [],
        [integOut, '0x2bc524525c82c045dec73846ab262b952c3622dde56cae1d8a7900cb377a74ce'],
        [],
      ),
    ).not.toThrow();
  });

  it('throws when disclosure PI[0] is the pre-integrity hash', () => {
    const wrong =
      '0x089aaf1a9dcb57dae69f7ea81298441e45a5dd908b7ba33828fa6b1f844164d4';
    expect(() =>
      assertDisclosureCommInMatchesIntegrityOut(
        'disclose_bytes_evm',
        [integIn, integOut],
        [],
        [wrong, '0x2bc524525c82c045dec73846ab262b952c3622dde56cae1d8a7900cb377a74ce'],
        [],
      ),
    ).toThrow(/outer chain broken/);
  });

  it('throws with ordering hint when value exists only at another index', () => {
    const wrong =
      '0x089aaf1a9dcb57dae69f7ea81298441e45a5dd908b7ba33828fa6b1f844164d4';
    const pis = [
      wrong,
      '0x1',
      '0x2',
      '0x3',
      '0x4',
      '0x5',
      integOut,
    ];
    expect(() =>
      assertDisclosureCommInMatchesIntegrityOut(
        'disclose_bytes_evm',
        [integIn, integOut],
        [],
        pis,
        [],
      ),
    ).toThrow(/publicInputs\[6\]/);
  });
});
