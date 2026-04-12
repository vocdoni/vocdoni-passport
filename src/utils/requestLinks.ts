import { Buffer } from 'buffer';
import { fetchProofRequestPayload, type ProofRequestPayload } from '../services/ServerClient';

function tryJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
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

function tryResolveVocdoniPassportLink(parsedUrl: URL): string | null {
  const pathname = parsedUrl.pathname.replace(/\/+$/, '');
  if (pathname !== '/passport') {
    return null;
  }

  const sign = (parsedUrl.searchParams.get('sign') || '').trim();
  if (!sign) {
    throw new Error('Passport link is missing sign payload');
  }
  const { serverHost, petitionId } = decodeSignedPassportLink(sign);

  let upstreamBase: URL;
  try {
    upstreamBase = new URL(`https://${serverHost}`);
  } catch {
    throw new Error('Passport link server host is invalid');
  }

  return joinUrl(upstreamBase.toString(), `/petition/${petitionId}`);
}

export async function resolveProofRequestPayload(raw: string): Promise<ProofRequestPayload> {
  const text = String(raw || '').trim();
  if (!text) {
    throw new Error('Empty request payload');
  }

  try {
    return parseProofRequestPayload(text);
  } catch {}

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(text);
  } catch {
    throw new Error('Request is neither valid JSON nor a valid URL');
  }

  const embeddedPayload =
    getQueryParam(parsedUrl.toString(), 'payload') ||
    getQueryParam(parsedUrl.toString(), 'request') ||
    getQueryParam(parsedUrl.toString(), 'c');

  if (embeddedPayload) {
    return parseProofRequestPayload(text);
  }

  const vocdoniPassportRequestUrl = tryResolveVocdoniPassportLink(parsedUrl);
  if (vocdoniPassportRequestUrl) {
    return fetchProofRequestPayload(vocdoniPassportRequestUrl);
  }

  return fetchProofRequestPayload(parsedUrl.toString());
}
