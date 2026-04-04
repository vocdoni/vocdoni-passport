import type { InnerProofPackage, ProofResult } from './ProofGenerator';

function jsonStringifySafe(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `0x${v.toString(16)}` : v));
}

export interface ProofRequestPayload {
  kind: string;
  version: number;
  aggregateUrl: string;
  petitionId?: string;
  service?: {
    name?: string;
    logo?: string;
    purpose?: string;
    scope?: string;
    mode?: string;
    devMode?: boolean;
    domain?: string;
  };
  query?: Record<string, any>;
}

function normalizeAggregateUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, '');
  if (trimmed.endsWith('/api/proofs/aggregate')) {
    return trimmed;
  }
  return `${trimmed}/api/proofs/aggregate`;
}

function baseUrlFromAggregate(value: string): string {
  return normalizeAggregateUrl(value).replace(/\/api\/proofs\/aggregate$/, '');
}

export interface ServerHealthStatus {
  url: string;
  status: string;
  service?: string;
}

export async function fetchProofRequestPayload(requestUrl: string): Promise<ProofRequestPayload> {
  const trimmed = String(requestUrl || '').trim();
  if (!trimmed) {
    throw new Error('Request link is empty');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Request link is not a valid URL');
  }

  const resp = await fetch(parsed.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const text = await resp.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch {
    throw new Error(`Request link returned non-JSON response (${resp.status}): ${text.slice(0, 200)}`);
  }
  if (!resp.ok) {
    throw new Error(body?.error || body?.message || `Request link failed (${resp.status})`);
  }
  if (!body || typeof body !== 'object') {
    throw new Error('Request link did not return a valid JSON payload');
  }
  if (!body.aggregateUrl || typeof body.aggregateUrl !== 'string') {
    throw new Error('Request payload is missing aggregateUrl');
  }
  return body as ProofRequestPayload;
}

export async function pingServerHealth(baseUrl: string): Promise<ServerHealthStatus> {
  const url = `${baseUrlFromAggregate(baseUrl)}/api/health`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const text = await resp.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch {
    throw new Error(`Health endpoint returned non-JSON response (${resp.status}): ${text.slice(0, 200)}`);
  }
  if (!resp.ok) {
    throw new Error(body?.error || body?.message || `Health check failed (${resp.status})`);
  }
  if (body?.status !== 'ok') {
    throw new Error(`Unexpected health response from server: ${JSON.stringify(body)}`);
  }
  return {
    url,
    status: String(body.status || 'ok'),
    service: body?.service ? String(body.service) : undefined,
  };
}

export class DuplicateSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateSignatureError';
  }
}

export class ServerError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ServerError';
    this.statusCode = statusCode;
  }
}

export async function aggregateProofOnServer(baseUrl: string, inner: InnerProofPackage, request?: ProofRequestPayload | null): Promise<ProofResult> {
  const url = normalizeAggregateUrl(baseUrl);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringifySafe({ ...inner, request }),
  });
  const text = await resp.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch {
    throw new ServerError(`Server returned non-JSON response (${resp.status}): ${text.slice(0, 300)}`, resp.status);
  }
  if (!resp.ok) {
    const errorMsg = body?.error || body?.message || `Aggregation failed (${resp.status})`;
    // Check for duplicate signature (HTTP 409 Conflict)
    if (resp.status === 409 || errorMsg.toLowerCase().includes('already exists') || errorMsg.toLowerCase().includes('duplicate')) {
      throw new DuplicateSignatureError(errorMsg);
    }
    throw new ServerError(errorMsg, resp.status);
  }
  return body as ProofResult;
}
