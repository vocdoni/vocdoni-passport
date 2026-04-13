import { Buffer } from 'buffer';
import { fetchProofRequestPayload, type ProofRequestPayload } from '../services/ServerClient';

// ─── NOTE on React Native URL compatibility ────────────────────────────────────
// React Native's built-in URL polyfill supports construction (`new URL(str)`)
// but throws "not implemented" for every property access: .hostname, .pathname,
// .searchParams, .toString(), etc.  All URL parsing in this file therefore uses
// plain string operations.  Do NOT introduce new URL(…).anything calls.
// ──────────────────────────────────────────────────────────────────────────────

function tryJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isValidHttpUrl(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.startsWith('https://') || lower.startsWith('http://');
}

export function getQueryParam(rawUrl: string, key: string): string | null {
  const text = String(rawUrl || '').trim();
  const queryIndex = text.indexOf('?');
  if (queryIndex < 0) {
    return null;
  }

  const fragmentIndex = text.indexOf('#', queryIndex);
  const query = text.slice(queryIndex + 1, fragmentIndex >= 0 ? fragmentIndex : undefined);
  for (const part of query.split('&')) {
    if (!part) {
      continue;
    }

    const eqIndex = part.indexOf('=');
    const rawKey = eqIndex >= 0 ? part.slice(0, eqIndex) : part;
    const rawValue = eqIndex >= 0 ? part.slice(eqIndex + 1) : '';
    const decodedKey = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    if (decodedKey !== key) {
      continue;
    }

    return decodeURIComponent(rawValue.replace(/\+/g, ' '));
  }

  return null;
}

export function parseProofRequestPayload(raw: string): ProofRequestPayload {
  const text = String(raw || '').trim();
  if (!text) {
    throw new Error('Empty request payload');
  }

  let payload = tryJsonParse(text);
  if (!payload) {
    try {
      const b64 = getQueryParam(text, 'payload') || getQueryParam(text, 'request') || getQueryParam(text, 'c');
      if (b64) {
        const normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
        payload = tryJsonParse(Buffer.from(padded, 'base64').toString('utf8'));
      }
    } catch {}
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Link does not contain a valid request');
  }

  if (!('aggregateUrl' in payload) || typeof payload.aggregateUrl !== 'string') {
    throw new Error('Request payload is missing aggregateUrl');
  }

  return payload as ProofRequestPayload;
}

function decodeSignedPassportLink(encoded: string): { serverHost: string; petitionId: string } {
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const decoded = Buffer.from(padded, 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf('|');
  if (separatorIndex <= 0 || separatorIndex === decoded.length - 1) {
    throw new Error('Passport link signature is invalid');
  }

  const serverHost = decoded.slice(0, separatorIndex).trim();
  const petitionId = decoded.slice(separatorIndex + 1).trim();
  if (!serverHost || !petitionId) {
    throw new Error('Passport link signature is missing host or petition ID');
  }

  return { serverHost, petitionId };
}

/**
 * Detects compact vocdoni.link/passport?sign=<base64> links and returns the
 * upstream petition URL to fetch, bypassing the Cloudflare redirect entirely.
 *
 * The `sign` parameter is base64(serverHost + "|" + petitionId).
 * Result URL: https://<serverHost>/petition/<petitionId>
 *
 * Uses only string operations — no URL object property access.
 */
function tryResolveVocdoniPassportLink(rawUrl: string): string | null {
  // Case-insensitive match on scheme + host + path prefix using the lowercased copy.
  // The raw URL is kept for getQueryParam so percent-encoding is preserved.
  const lower = rawUrl.toLowerCase();
  const PREFIX = 'https://vocdoni.link/passport';

  if (!lower.startsWith(PREFIX)) {
    return null;
  }

  // The character immediately after "/passport" must be end-of-string, "/", "?", or "#".
  // This prevents "https://vocdoni.link/passportX" from matching.
  const afterPath = lower.slice(PREFIX.length);
  if (afterPath !== '' && !afterPath.startsWith('/') && !afterPath.startsWith('?') && !afterPath.startsWith('#')) {
    return null;
  }

  const sign = (getQueryParam(rawUrl, 'sign') || '').trim();
  if (!sign) {
    throw new Error('Passport link is missing sign payload');
  }

  const { serverHost, petitionId } = decodeSignedPassportLink(sign);
  return `https://${serverHost}/petition/${petitionId}`;
}

export async function resolveProofRequestPayload(raw: string): Promise<ProofRequestPayload> {
  const text = String(raw || '').trim();
  if (!text) {
    throw new Error('Empty request payload');
  }

  // 1. Try as an embedded payload (raw JSON or base64 via ?payload= / ?request= / ?c=)
  try {
    return parseProofRequestPayload(text);
  } catch {}

  // 2. Must be an HTTP(S) URL to proceed
  if (!isValidHttpUrl(text)) {
    throw new Error('Request is neither valid JSON nor a valid URL');
  }

  // 3. Embedded payload params already handled by parseProofRequestPayload above,
  //    but if that threw for a different reason re-check explicitly
  const embeddedPayload =
    getQueryParam(text, 'payload') ||
    getQueryParam(text, 'request') ||
    getQueryParam(text, 'c');

  if (embeddedPayload) {
    return parseProofRequestPayload(text);
  }

  // 4. Compact vocdoni.link/passport?sign=… link — decode locally, fetch upstream
  const vocdoniPassportRequestUrl = tryResolveVocdoniPassportLink(text);
  if (vocdoniPassportRequestUrl) {
    return fetchProofRequestPayload(vocdoniPassportRequestUrl);
  }

  // 5. Treat as a direct petition JSON endpoint
  return fetchProofRequestPayload(text);
}
