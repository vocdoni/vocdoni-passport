import { getCommitmentInFromDisclosureProof, getCommitmentOutFromIntegrityProof } from '@zkpassport/utils';

/**
 * Outer circuit requires: integrity public commitment out == disclosure public commitment in (PI[0]).
 * @see circuits/src/noir/lib/outer/src/lib.nr verify_subproofs
 */
export function assertDisclosureCommInMatchesIntegrityOut(
  circuitName: string,
  integrityPublicInputs: string[],
  integrityProof: string[],
  disclosurePublicInputs: string[],
  disclosureProof: string[],
): void {
  const expectedOut = getCommitmentOutFromIntegrityProof({
    publicInputs: integrityPublicInputs,
    proof: integrityProof,
  });
  const disclosedIn = getCommitmentInFromDisclosureProof({
    publicInputs: disclosurePublicInputs,
    proof: disclosureProof,
  });
  if (disclosedIn === expectedOut) {
    return;
  }
  const idx = disclosurePublicInputs.findIndex((p) => BigInt(p) === expectedOut);
  throw new Error(
    `${circuitName}: outer chain broken — disclosure comm_in (PI[0]) ${disclosedIn.toString(16)} ` +
      `!= integrity comm_out ${expectedOut.toString(16)}. ` +
      (idx >= 0
        ? `Integrity out appears at disclosure.publicInputs[${idx}] instead of [0] (public input ordering mismatch).`
        : 'Integrity commitment out is not present in disclosure public inputs (witness comm_in likely ignored or wrong).'),
  );
}
