/**
 * Passport SOD Parser
 *
 * Minimal ASN.1 DER parser to extract the key structures from the
 * Security Object Document (SOD) of an NFC passport.
 *
 * The SOD is a CMS SignedData structure containing:
 *   - Signed attributes (hash of the data group hashes)
 *   - DSC certificate (TBS + signature)
 *   - Signature over the signed attributes
 *   - eContent (data group hash table)
 */

interface SODParsed {
  signedAttributes: number[];
  eContent: number[];
  tbsCertificate: number[];
  dscSignature: number[];
  sodSignature: number[];
  signatureAlgorithmOid: string;
  hashAlgorithmOid: string;
}

/**
 * Parse SOD DER bytes and extract the structures needed for circuit inputs.
 */
export function parseSOD(sod: Uint8Array): SODParsed {
  const result: SODParsed = {
    signedAttributes: [],
    eContent: [],
    tbsCertificate: [],
    dscSignature: [],
    sodSignature: [],
    signatureAlgorithmOid: '',
    hashAlgorithmOid: '',
  };

  try {
    // SOD outer: SEQUENCE { OID, [0] SignedData }
    // Skip ICAO SOD wrapper tag (0x77) if present
    let startOffset = 0;
    if (sod[0] === 0x77) {
      const wrapper = parseTLV(sod, 0);
      if (wrapper) {startOffset = wrapper.contentStart;}
    }

    const outer = parseTLV(sod, startOffset);
    if (!outer) {return result;}

    // Find the SignedData content (tagged [0])
    let pos = outer.contentStart;
    while (pos < outer.contentStart + outer.contentLength) {
      const tlv = parseTLV(sod, pos);
      if (!tlv) {break;}
      if (tlv.tag === 0xa0) {
        // SignedData SEQUENCE inside the [0] context tag
        const sd = parseTLV(sod, tlv.contentStart);
        if (sd) {parseSignedData(sod, sd.contentStart, sd.contentLength, result);}
        break;
      }
      pos = tlv.contentStart + tlv.contentLength;
    }
  } catch (e) {
    console.warn('SOD parse error:', e);
  }

  return result;
}

function parseSignedData(
  buf: Uint8Array, start: number, len: number, result: SODParsed,
) {
  let pos = start;
  const end = start + len;
  let fieldIndex = 0;

  while (pos < end) {
    const tlv = parseTLV(buf, pos);
    if (!tlv) {break;}

    if (fieldIndex === 1 && tlv.tag === 0x31) {
      // SET OF DigestAlgorithmIdentifier
      const algoSeq = parseTLV(buf, tlv.contentStart);
      if (algoSeq) {
        const oidTlv = parseTLV(buf, algoSeq.contentStart);
        if (oidTlv && oidTlv.tag === 0x06) {
          result.hashAlgorithmOid = oidToString(buf.slice(oidTlv.contentStart, oidTlv.contentStart + oidTlv.contentLength));
        }
      }
    }

    if (fieldIndex === 2 && tlv.tag === 0x30) {
      // EncapContentInfo: SEQUENCE { OID, [0] { OCTET STRING } }
      let ePos = tlv.contentStart;
      const eEnd = tlv.contentStart + tlv.contentLength;
      while (ePos < eEnd) {
        const eTlv = parseTLV(buf, ePos);
        if (!eTlv) {break;}
        if (eTlv.tag === 0xa0) {
          const octet = parseTLV(buf, eTlv.contentStart);
          if (octet) {
            result.eContent = Array.from(buf.slice(octet.contentStart, octet.contentStart + octet.contentLength));
          }
        }
        ePos = eTlv.contentStart + eTlv.contentLength;
      }
    }

    if (tlv.tag === 0xa0 && fieldIndex >= 3) {
      // [0] certificates
      const certSeq = parseTLV(buf, tlv.contentStart);
      if (certSeq && certSeq.tag === 0x30) {
        parseCertificate(buf, certSeq.contentStart, certSeq.contentLength, result);
      }
    }

    if (tlv.tag === 0x31 && fieldIndex >= 4) {
      // SET OF SignerInfo
      const siSeq = parseTLV(buf, tlv.contentStart);
      if (siSeq) {parseSignerInfo(buf, siSeq.contentStart, siSeq.contentLength, result);}
    }

    pos = tlv.contentStart + tlv.contentLength;
    fieldIndex++;
  }
}

function parseCertificate(
  buf: Uint8Array, start: number, len: number, result: SODParsed,
) {
  let pos = start;
  const end = start + len;
  let fi = 0;

  while (pos < end) {
    const tlv = parseTLV(buf, pos);
    if (!tlv) {break;}
    if (fi === 0 && tlv.tag === 0x30) {
      // TBSCertificate
      result.tbsCertificate = Array.from(buf.slice(pos, tlv.contentStart + tlv.contentLength));
    }
    if (fi === 1 && tlv.tag === 0x30) {
      // Signature algorithm
      const oidTlv = parseTLV(buf, tlv.contentStart);
      if (oidTlv && oidTlv.tag === 0x06) {
        result.signatureAlgorithmOid = oidToString(buf.slice(oidTlv.contentStart, oidTlv.contentStart + oidTlv.contentLength));
      }
    }
    if (fi === 2 && tlv.tag === 0x03) {
      // Signature BIT STRING (skip the unused bits byte)
      result.dscSignature = Array.from(buf.slice(tlv.contentStart + 1, tlv.contentStart + tlv.contentLength));
    }
    pos = tlv.contentStart + tlv.contentLength;
    fi++;
  }
}

function parseSignerInfo(
  buf: Uint8Array, start: number, len: number, result: SODParsed,
) {
  let pos = start;
  const end = start + len;
  let fi = 0;

  while (pos < end) {
    const tlv = parseTLV(buf, pos);
    if (!tlv) {break;}
    if (tlv.tag === 0xa0) {
      // [0] signedAttrs - IMPORTANT: for hash verification, we need the raw DER
      // but with tag changed from IMPLICIT [0] (0xa0) to SET (0x31)
      const rawAttrs = Array.from(buf.slice(pos, tlv.contentStart + tlv.contentLength));
      rawAttrs[0] = 0x31; // Change tag for hash computation
      result.signedAttributes = rawAttrs;
    }
    if (tlv.tag === 0x04 && fi >= 4) {
      // OCTET STRING - the signature
      result.sodSignature = Array.from(buf.slice(tlv.contentStart, tlv.contentStart + tlv.contentLength));
    }
    pos = tlv.contentStart + tlv.contentLength;
    fi++;
  }
}

// ---- Minimal ASN.1 DER parser ----

interface TLV {
  tag: number;
  contentStart: number;
  contentLength: number;
}

function parseTLV(buf: Uint8Array, offset: number): TLV | null {
  if (offset >= buf.length) {return null;}
  const tag = buf[offset];
  let pos = offset + 1;
  if (pos >= buf.length) {return null;}

  let length = buf[pos++];
  if (length === 0x80) {
    // Indefinite length - not handling
    return null;
  }
  if (length > 0x80) {
    const numBytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < numBytes; i++) {
      if (pos >= buf.length) {return null;}
      length = (length << 8) | buf[pos++];
    }
  }

  return { tag, contentStart: pos, contentLength: length };
}

function oidToString(bytes: Uint8Array): string {
  if (bytes.length === 0) {return '';}
  const parts: number[] = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let val = 0;
  for (let i = 1; i < bytes.length; i++) {
    val = (val << 7) | (bytes[i] & 0x7f);
    if ((bytes[i] & 0x80) === 0) { parts.push(val); val = 0; }
  }
  return parts.join('.');
}

// ---- Algorithm detection helpers ----

const OID_MAP: Record<string, { algo: string; hash: string; keySize?: number }> = {
  '1.2.840.113549.1.1.5':  { algo: 'rsa', hash: 'sha1' },
  '1.2.840.113549.1.1.11': { algo: 'rsa', hash: 'sha256' },
  '1.2.840.113549.1.1.12': { algo: 'rsa', hash: 'sha384' },
  '1.2.840.113549.1.1.13': { algo: 'rsa', hash: 'sha512' },
  '1.2.840.113549.1.1.10': { algo: 'rsapss', hash: 'sha256' },
  '1.2.840.10045.4.3.2':   { algo: 'ecdsa', hash: 'sha256' },
  '1.2.840.10045.4.3.3':   { algo: 'ecdsa', hash: 'sha384' },
  '1.2.840.10045.4.3.4':   { algo: 'ecdsa', hash: 'sha512' },
  '2.16.840.1.101.3.4.2.1': { algo: 'hash', hash: 'sha256' },
  '2.16.840.1.101.3.4.2.2': { algo: 'hash', hash: 'sha384' },
  '2.16.840.1.101.3.4.2.3': { algo: 'hash', hash: 'sha512' },
  '1.3.14.3.2.26':          { algo: 'hash', hash: 'sha1' },
};

export function getAlgorithmInfo(oid: string): { algo: string; hash: string } {
  return OID_MAP[oid] || { algo: 'unknown', hash: 'unknown' };
}

export function detectKeySize(tbsCert: number[]): number {
  // Look for RSA modulus in TBS certificate
  // The modulus is a large INTEGER inside SubjectPublicKeyInfo
  // Heuristic: find the largest INTEGER
  let maxIntLen = 0;
  for (let i = 0; i < tbsCert.length - 3; i++) {
    if (tbsCert[i] === 0x02) { // INTEGER tag
      let len = tbsCert[i + 1];
      let pos = i + 2;
      if (len > 0x80) {
        const nb = len & 0x7f;
        len = 0;
        for (let j = 0; j < nb; j++) {len = (len << 8) | tbsCert[pos++];}
      }
      if (len > maxIntLen) {maxIntLen = len;}
    }
  }
  // Modulus length in bytes → key size in bits
  if (maxIntLen >= 512) {return 4096;}
  if (maxIntLen >= 384) {return 3072;}
  if (maxIntLen >= 256) {return 2048;}
  if (maxIntLen >= 128) {return 1024;}
  return 2048; // default
}
