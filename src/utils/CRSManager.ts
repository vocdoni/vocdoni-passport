import { Buffer } from 'buffer';
import RNFS from 'react-native-fs';

const CRS_BASE_URL = 'https://crs.aztec.network';
const POINT_BYTES = 64;

type ProgressFn = (step: string, detail: string) => void;

type RemoteFileInfo = {
  size?: number;
  acceptsRanges?: boolean;
};

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < Math.max(1, n)) {p <<= 1;}
  return p;
}

function crsDir(): string {
  return `${RNFS.DocumentDirectoryPath}/bb-crs`;
}

async function ensureDir(): Promise<string> {
  const dir = crsDir();
  const exists = await RNFS.exists(dir);
  if (!exists) {await RNFS.mkdir(dir);}
  return dir;
}

async function fileSize(path: string): Promise<number> {
  try {
    const stat = await RNFS.stat(path);
    return Number(stat.size || 0);
  } catch {
    return 0;
  }
}

function parseContentLength(v: string | null): number | undefined {
  if (!v) {return undefined;}
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parseContentRangeTotal(v: string | null): number | undefined {
  if (!v) {return undefined;}
  const m = /bytes\s+\d+-\d+\/(\d+|\*)/i.exec(v);
  if (!m || m[1] === '*') {return undefined;}
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

async function probeRemoteFile(url: string, onP: ProgressFn, label: string): Promise<RemoteFileInfo> {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    const size = parseContentLength(head.headers.get('content-length'));
    const acceptsRanges = (head.headers.get('accept-ranges') || '').toLowerCase().includes('bytes');
    onP('crs', `${label} HEAD ${head.status} size=${size ?? 'unknown'} ranges=${acceptsRanges}`);
    if (head.ok || head.status === 405 || head.status === 403) {
      return { size, acceptsRanges };
    }
  } catch (err) {
    onP('crs', `${label} HEAD failed: ${String(err)}`);
  }

  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    const size = parseContentRangeTotal(res.headers.get('content-range')) ?? parseContentLength(res.headers.get('content-length'));
    const acceptsRanges = res.status === 206 || (res.headers.get('accept-ranges') || '').toLowerCase().includes('bytes');
    onP('crs', `${label} probe GET ${res.status} size=${size ?? 'unknown'} ranges=${acceptsRanges}`);
    return { size, acceptsRanges };
  } catch (err) {
    onP('crs', `${label} probe GET failed: ${String(err)}`);
    return {};
  }
}

async function appendTmpChunk(tmp: string, dest: string, append: boolean) {
  const tmpData = await RNFS.readFile(tmp, 'base64');
  const chunk = Buffer.from(tmpData, 'base64');
  if (append) {
    await RNFS.appendFile(dest, chunk.toString('base64'), 'base64');
  } else {
    await RNFS.writeFile(dest, chunk.toString('base64'), 'base64');
  }
}

async function downloadWhole(url: string, dest: string, onP: ProgressFn, label: string, minBytes?: number) {
  const current = await fileSize(dest);
  if (current > 0 && (!minBytes || current >= minBytes)) {
    onP('crs', `${label} already present (${current} bytes)`);
    return;
  }

  const tmp = `${dest}.full.part`;
  if (await RNFS.exists(tmp)) {await RNFS.unlink(tmp);}

  onP('crs', `Downloading ${label} (full)...`);
  const res = await RNFS.downloadFile({
    fromUrl: url,
    toFile: tmp,
    discretionary: true,
    background: false,
    progressDivider: 10,
    progress: (p) => {
      onP('crs', `${label} full ${Number(p.bytesWritten || 0)}`);
    },
  }).promise;

  onP('crs', `${label} full HTTP ${res.statusCode || 'unknown'}`);
  if (res.statusCode && res.statusCode >= 300) {
    if (await RNFS.exists(tmp)) {await RNFS.unlink(tmp);}
    throw new Error(`${label} full download failed with HTTP ${res.statusCode}`);
  }

  const downloaded = await fileSize(tmp);
  if (downloaded <= 0) {
    if (await RNFS.exists(tmp)) {await RNFS.unlink(tmp);}
    throw new Error(`${label} full download produced empty file`);
  }

  if (await RNFS.exists(dest)) {await RNFS.unlink(dest);}
  await RNFS.moveFile(tmp, dest);

  const finalSize = await fileSize(dest);
  if (minBytes && finalSize < minBytes) {
    throw new Error(`${label} full download incomplete: ${finalSize}/${minBytes}`);
  }
  onP('crs', `${label} ready (${finalSize} bytes)`);
}

async function downloadRangeOrWhole(url: string, dest: string, bytesNeeded: number, onP: ProgressFn, label: string) {
  const current = await fileSize(dest);
  if (current >= bytesNeeded) {
    onP('crs', `${label} already present (${current} bytes, need ${bytesNeeded})`);
    return;
  }

  onP('crs', `${label} current=${current} need=${bytesNeeded}`);
  const remote = await probeRemoteFile(url, onP, label);
  const effectiveNeed = remote.size ? Math.min(bytesNeeded, remote.size) : bytesNeeded;

  if (current >= effectiveNeed) {
    onP('crs', `${label} local file already satisfies effective need (${current}/${effectiveNeed})`);
    return;
  }

  const canRange = remote.acceptsRanges !== false;
  if (!canRange || effectiveNeed === 0) {
    onP('crs', `${label} range unsupported or unnecessary, using full download`);
    await downloadWhole(url, dest, onP, label, effectiveNeed);
    return;
  }

  const from = current;
  const to = effectiveNeed - 1;
  const tmp = `${dest}.range.part`;
  if (await RNFS.exists(tmp)) {await RNFS.unlink(tmp);}

  onP('crs', `Downloading ${label} bytes ${from}-${to}...`);
  const res = await RNFS.downloadFile({
    fromUrl: url,
    toFile: tmp,
    headers: { Range: `bytes=${from}-${to}` },
    discretionary: true,
    background: false,
    progressDivider: 10,
    progress: (p) => {
      const done = from + Number(p.bytesWritten || 0);
      onP('crs', `${label} ${done}/${effectiveNeed}`);
    },
  }).promise;

  onP('crs', `${label} HTTP ${res.statusCode || 'unknown'}`);

  if (res.statusCode === 416) {
    if (await RNFS.exists(tmp)) {await RNFS.unlink(tmp);}
    const after416Current = await fileSize(dest);
    const reprobe = await probeRemoteFile(url, onP, `${label} after-416`);
    const remoteSize = reprobe.size ?? remote.size;
    if (remoteSize !== undefined && after416Current >= remoteSize) {
      onP('crs', `${label} server reports EOF at ${remoteSize}; local file already complete`);
      return;
    }
    if (remoteSize !== undefined && after416Current >= effectiveNeed) {
      onP('crs', `${label} local file satisfies requested size after 416`);
      return;
    }
    onP('crs', `${label} received 416; falling back to full download`);
    await downloadWhole(url, dest, onP, label, effectiveNeed);
    return;
  }

  if (res.statusCode && res.statusCode !== 206 && res.statusCode !== 200) {
    if (await RNFS.exists(tmp)) {await RNFS.unlink(tmp);}
    throw new Error(`${label} range download failed with HTTP ${res.statusCode}`);
  }

  const tmpSize = await fileSize(tmp);
  if (tmpSize <= 0) {
    if (await RNFS.exists(tmp)) {await RNFS.unlink(tmp);}
    throw new Error(`${label} range download produced empty file`);
  }

  const append = from > 0 && res.statusCode === 206;
  await appendTmpChunk(tmp, dest, append);
  await RNFS.unlink(tmp);

  const finalSize = await fileSize(dest);
  if (finalSize < effectiveNeed) {
    onP('crs', `${label} after range download still short (${finalSize}/${effectiveNeed}), falling back to full download`);
    await downloadWhole(url, dest, onP, label, effectiveNeed);
    return;
  }

  onP('crs', `${label} ready (${finalSize} bytes)`);
}

export async function ensureCrsFilesForCircuits(circuitSizes: number[], onP: ProgressFn): Promise<string> {
  const dir = await ensureDir();
  onP('crs', `Manifest circuit sizes: ${circuitSizes.join(',')}`);
  const maxCircuitSize = Math.max(1, ...circuitSizes.filter((x) => Number.isFinite(x) && x > 0));
  const bn254Points = nextPowerOfTwo(maxCircuitSize) + 1;
  const grumpkinPoints = Math.max(1 << 15, nextPowerOfTwo(Math.min(Math.max(maxCircuitSize, 1), 1 << 18)) + 1);

  onP('crs', `Preparing CRS in ${dir}`);
  onP('crs', `Need bn254 points=${bn254Points}, grumpkin points=${grumpkinPoints}`);

  const g1Path = `${dir}/bn254_g1.dat`;
  const g2Path = `${dir}/bn254_g2.dat`;
  const gkPath = `${dir}/grumpkin_g1.flat.dat`;
  const g1Need = bn254Points * POINT_BYTES;
  const gkNeed = grumpkinPoints * POINT_BYTES;
  const g1Ok = (await fileSize(g1Path)) >= g1Need;
  const g2Ok = (await fileSize(g2Path)) > 0;
  const gkOk = (await fileSize(gkPath)) >= gkNeed;
  if (g1Ok && g2Ok && gkOk) {
    onP('crs', 'CRS files already satisfy manifest sizes; skipping network');
    return dir;
  }

  await downloadRangeOrWhole(`${CRS_BASE_URL}/g1.dat`, g1Path, g1Need, onP, 'bn254_g1.dat');
  await downloadWhole(`${CRS_BASE_URL}/g2.dat`, g2Path, onP, 'bn254_g2.dat');
  await downloadRangeOrWhole(`${CRS_BASE_URL}/grumpkin_g1.dat`, gkPath, gkNeed, onP, 'grumpkin_g1.flat.dat');

  return dir;
}
