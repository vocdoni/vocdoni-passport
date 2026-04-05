import RNFS from 'react-native-fs';

const CACHE_ROOT = `${RNFS.DocumentDirectoryPath}/zkpassport-registry-cache`;

async function ensureCacheDir(): Promise<void> {
  if (!(await RNFS.exists(CACHE_ROOT))) {
    await RNFS.mkdir(CACHE_ROOT);
  }
}

function manifestFile(version: string): string {
  const safe = version.replace(/[^0-9a-zA-Z._-]/g, '_');
  return `${CACHE_ROOT}/manifest_${safe}.json`;
}

function certsFile(rootHex: string): string {
  const safe = rootHex.replace(/^0x/i, '').replace(/[^a-fA-F0-9]/g, '').slice(0, 64);
  return `${CACHE_ROOT}/certs_${safe || 'unknown'}.json`;
}

function circuitFile(circuitHash: string): string {
  const safe = circuitHash.replace(/^0x/i, '').replace(/[^a-fA-F0-9]/g, '').slice(0, 64);
  return `${CACHE_ROOT}/circuit_${safe || 'unknown'}.json`;
}

async function atomicWriteUtf8(dest: string, data: string): Promise<void> {
  const tmp = `${dest}.${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`;
  await RNFS.writeFile(tmp, data, 'utf8');
  if (await RNFS.exists(dest)) {
    await RNFS.unlink(dest);
  }
  await RNFS.moveFile(tmp, dest);
}

export async function readCachedManifest(version: string): Promise<unknown | null> {
  const path = manifestFile(version);
  if (!(await RNFS.exists(path))) {return null;}
  try {
    const raw = await RNFS.readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeCachedManifest(version: string, manifest: unknown): Promise<void> {
  await ensureCacheDir();
  await atomicWriteUtf8(manifestFile(version), JSON.stringify(manifest));
}

export async function readCachedCertificates(rootHex: string): Promise<unknown | null> {
  const path = certsFile(rootHex);
  if (!(await RNFS.exists(path))) {return null;}
  try {
    const raw = await RNFS.readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeCachedCertificates(rootHex: string, packaged: unknown): Promise<void> {
  await ensureCacheDir();
  await atomicWriteUtf8(certsFile(rootHex), JSON.stringify(packaged));
}

export async function readCachedPackagedCircuit(circuitHash: string): Promise<unknown | null> {
  const path = circuitFile(circuitHash);
  if (!(await RNFS.exists(path))) {return null;}
  try {
    const raw = await RNFS.readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeCachedPackagedCircuit(circuitHash: string, packaged: unknown): Promise<void> {
  await ensureCacheDir();
  await atomicWriteUtf8(circuitFile(circuitHash), JSON.stringify(packaged));
}
