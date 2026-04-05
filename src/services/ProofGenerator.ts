import { Buffer } from 'buffer';
import pako from 'pako';
import { sha256 } from '@noble/hashes/sha2.js';
import { RegistryClient } from '@zkpassport/registry';
import {
  Binary,
  SOD,
  extractTBS,
  getAgeCircuitInputs,
  getBindCircuitInputs,
  getCscaForPassportAsync,
  getDSCCircuitInputs,
  getDSCSignatureHashAlgorithm,
  getDiscloseCircuitInputs,
  getECDSAInfo,
  getIDDataCircuitInputs,
  getIntegrityCheckCircuitInputs,
  getIssuingCountryExclusionCircuitInputs,
  getIssuingCountryInclusionCircuitInputs,
  getNationalityExclusionCircuitInputs,
  getNationalityInclusionCircuitInputs,
  getRSAInfo,
  getServiceScopeHash,
  getServiceSubscopeHash,
  getSodSignatureAlgorithmHashAlgorithm,
  getTBSMaxLen,
  getNumberOfPublicInputsFromVkey,
  ultraVkToFields,
  getCircuitMerkleProof,
  type Query,
  type BoundData,
} from '@zkpassport/utils';

import { Platform } from 'react-native';
import { circuitProve, isAvailable, setBbCrsPath } from '../native/Barretenberg';
import { isAcvmWitnessAvailable, solveCompressedWitness } from '../native/AcvmWitness';
import { assertDisclosureCommInMatchesIntegrityOut } from './proofCommitmentAssertions';
import { ensureCrsFilesForCircuits } from '../utils/CRSManager';
import {
  readCachedCertificates,
  readCachedManifest,
  readCachedPackagedCircuit,
  writeCachedCertificates,
  writeCachedManifest,
  writeCachedPackagedCircuit,
} from './RegistryCache';

const CHAIN_ID = 11155111;
const CIRCUIT_VERSION = '0.16.0';
const TIMING_TAG = '[ProofTiming]';

type ProgressFn = (step: string, detail: string) => void;

export interface PassportData { dg1: string; sod: string; dg2?: string }
export interface ProofResult {
  proof: string;
  publicInputs: string[];
  vkeyHash: string;
  version: string;
  name: string;
  nullifier?: string;
  metadata?: Record<string, string>;
}

export interface InnerProofPackage {
  version: string;
  currentDate: number;
  dsc: OuterCircuitProof & { circuitName: string };
  idData: OuterCircuitProof & { circuitName: string };
  integrity: OuterCircuitProof & { circuitName: string };
  disclosures: Array<OuterCircuitProof & { circuitName: string }>;
}

type OuterCircuitProof = {
  proof: string[];
  publicInputs: string[];
  vkey: string[];
  keyHash: string;
  treeHashPath: string[];
  treeIndex: string;
};

const STARTUP_BASELINE_CIRCUITS = [
  'disclose_bytes_evm',
  'sig_check_dsc_tbs_1000_rsa_pkcs_4096_sha256',
  'sig_check_id_data_tbs_1000_rsa_pkcs_2048_sha256',
  'data_check_integrity_sa_sha256_dg_sha1',
] as const;

type PreparedCircuitArtifact = {
  packaged: any;
  bytecode: Uint8Array;
  vkey: Uint8Array;
  vkeyFields: string[];
  expectedPublicInputs: number;
};

const sessionManifestCache = new Map<string, any>();
const sessionCertificatesCache = new Map<string, any>();
const sessionPackagedCircuitCache = new Map<string, any>();
const sessionPreparedCircuitCache = new Map<string, PreparedCircuitArtifact>();
const sessionMerkleProofCache = new Map<string, { path: string[]; index: number }>();

// Extended query type that includes optional_data fields not in the standard zkPassport SDK
export interface ExtendedQuery extends Query {
  optional_data_1?: { disclose?: boolean };
  optional_data_2?: { disclose?: boolean };
}

// MRZ byte ranges for TD1 (ID cards) and TD3 (passports) formats
const MRZ_FIELD_RANGES = {
  // TD1 format (ID cards, 90 chars = 3 lines of 30)
  td1: {
    document_type: [0, 2],
    issuing_country: [2, 5],
    document_number: [5, 14],
    optional_data_1: [15, 30],  // Line 1, positions 15-29 (15 chars)
    birthdate: [30, 36],
    gender: [37, 38],
    expiry_date: [38, 44],
    nationality: [45, 48],
    optional_data_2: [48, 59],  // Line 2, positions 18-28 (11 chars)
    name: [60, 90],
  },
  // TD3 format (passports, 88 chars = 2 lines of 44)
  td3: {
    document_type: [0, 2],
    issuing_country: [2, 5],
    name: [5, 44],
    document_number: [44, 53],
    nationality: [54, 57],
    birthdate: [57, 63],
    gender: [64, 65],
    expiry_date: [65, 71],
    optional_data_1: [71, 85],  // Personal number field (14 chars)
  },
};

function getMrzFormat(mrzLength: number): 'td1' | 'td3' {
  return mrzLength >= 90 ? 'td1' : 'td3';
}

function logTiming(stage: string, startedAt: number, detail?: string): void {
  const elapsedMs = Date.now() - startedAt;
  const suffix = detail ? ` ${detail}` : '';
  console.info(`${TIMING_TAG} ${stage} ${elapsedMs}ms${suffix}`);
}

async function timed<T>(stage: string, fn: () => Promise<T>, detail?: string): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    logTiming(stage, startedAt, detail);
    return result;
  } catch (error) {
    logTiming(`${stage}.failed`, startedAt, detail);
    throw error;
  }
}

export interface ProofOptions {
  walletAddress?: string;
}

export async function generatePassportInnerProofPackage(pd: PassportData, onP: ProgressFn, requestQuery?: Query | null, requestService?: { scope?: string } | null, options?: ProofOptions): Promise<InnerProofPackage> {
  if (!isAcvmWitnessAvailable()) {
    throw new Error(
      'On-device witness solving requires the AcvmWitness native module (Rust acvm_witness_jni in vocdoni-passport-prover/crates/acvm-witness-jni).',
    );
  }
  if (!isAvailable()) {
    if (Platform.OS === 'ios') {
      throw new Error(
        'Barretenberg proving is not linked on iOS yet (JNI exists on Android only). Witness solving works on iOS; full inner+outer zk flow needs an iOS bb build.',
      );
    }
    throw new Error('Barretenberg native module not loaded');
  }

  const registry = new RegistryClient({ chainId: CHAIN_ID });
  const passport = buildPassportViewModel(pd);
  const tbsBucket = getTBSMaxLen(passport);

  onP('parse', `MRZ len=${passport.mrz.length}, TBS bucket=${tbsBucket}`);

  onP('registry', 'Circuit manifest (cache or network)...');
  const manifest = await timed('manifest.ensure', () => ensureManifest(registry), CIRCUIT_VERSION);
  onP('registry', `Manifest version ${manifest.version}, root ${manifest.root}`);

  onP('registry', 'Certificate registry (cache or network)...');
  const certRoot = await timed('certificates.root', () => registry.getLatestCertificateRoot());
  const packagedCerts = await timed('certificates.ensure', () => ensureCertificates(registry, certRoot), certRoot);
  onP('registry', `Certificates loaded: ${packagedCerts.certificates.length}`);

  const normalizedQuery = normalizeRequestQuery(requestQuery);
  const walletAddress = options?.walletAddress;
  const disclosurePlans = buildDisclosurePlans(normalizedQuery, walletAddress);
  const disclosureCount = disclosurePlans.length;
  const outerName = `outer_evm_count_${3 + disclosureCount}`;
  const { dscName, idDataName, integrityName, debug } = await deriveCircuitNames(passport, packagedCerts, manifest, outerName);
  const circuitNames = [dscName, idDataName, integrityName, ...disclosurePlans.map((p) => p.circuitName), outerName];
  for (const name of circuitNames) {
    if (!manifest?.circuits?.[name]) {throw new Error(`Required circuit not found in manifest: ${name}`);}
  }
  onP('circuits', `DSC: ${debug.dsc}`);
  onP('circuits', `ID : ${debug.id}`);
  onP('circuits', `Disclosure plans: ${disclosurePlans.map((p) => p.circuitName).join(', ')}`);
  onP('circuits', `Circuits: ${circuitNames.join(', ')}`);

  onP('download', 'Warming circuit artifacts...');
  await timed(
    'circuits.prepare',
    () => Promise.all(circuitNames.map((name) => ensurePreparedCircuit(registry, manifest, name))).then(() => undefined),
    circuitNames.join(','),
  );

  onP('download', 'Preparing CRS from manifest sizes...');
  const crsDir = await timed(
    'crs.ensure',
    () => ensureCrsFilesForCircuits(circuitNames.map((name) => Number(manifest.circuits?.[name]?.size || 0)), onP),
    `${circuitNames.length} circuits`,
  );
  setBbCrsPath(crsDir);

  const saltDscIn = randomBigInt();
  // Must remain stable with disclosure circuits; they don't accept saltIdOut, so use 0n.
  const saltIdOut = 0n;
  const saltsOut = {
    dg1Salt: randomBigInt(),
    expiryDateSalt: randomBigInt(),
    dg2HashSalt: randomBigInt(),
    privateNullifierSalt: randomBigInt(),
  };
  // Use NON_SALTED nullifier (0n) - salted nullifiers not supported in outer circuit v0.16.0
  const nullifierSecret = 0n;
  const serviceScope = getServiceScopeHash(requestService?.scope || 'vocdoni.app');
  const serviceSubscope = getServiceSubscopeHash('petition');
  const currentDateTimestamp = Math.floor(Date.now() / 1000);

  onP('inputs', 'Deriving real zkPassport circuit inputs...');
  const [dscInputs, idInputs, integrityInputs] = await timed(
    'inputs.primary',
    () => Promise.all([
      getDSCCircuitInputs(passport as any, saltDscIn, packagedCerts as any),
      getIDDataCircuitInputs(passport as any, saltDscIn, saltIdOut),
      getIntegrityCheckCircuitInputs(passport as any, saltIdOut, saltsOut as any),
    ]),
    `${dscName},${idDataName},${integrityName}`,
  );

  if (!dscInputs) {throw new Error('Could not derive DSC inputs');}
  if (!idInputs) {throw new Error('Could not derive ID data inputs');}
  if (!integrityInputs) {throw new Error('Could not derive integrity inputs');}

  onP('prove', `[1/${3 + disclosureCount}] ${dscName}`);
  const dscProof = await fetchAndProveInnerCircuit(registry, manifest, dscName, dscInputs, onP);
  onP('prove', `  ✅ ${dscName}`);

  onP('prove', `[2/${3 + disclosureCount}] ${idDataName}`);
  const idProof = await fetchAndProveInnerCircuit(registry, manifest, idDataName, idInputs, onP);
  onP('prove', `  ✅ ${idDataName}`);

  onP('prove', `[3/${3 + disclosureCount}] ${integrityName}`);
  const integrityProof = await fetchAndProveInnerCircuit(registry, manifest, integrityName, integrityInputs, onP);
  onP('prove', `  ✅ ${integrityName}`);

  // comm_in must come from getDiscloseCircuitInputs (hashSaltDg1Dg2HashPrivateNullifier); the circuit
  // asserts it matches witness salts. Overwriting it with integrity PI breaks ACVM (Failed assertion).
  // Align passport.dataGroups with SOD eContent hashes + algorithm so that hash equals integrity out.

  const disclosureProofs: Array<OuterCircuitProof & { circuitName: string }> = [];
  for (let i = 0; i < disclosurePlans.length; i++) {
    const plan = disclosurePlans[i];
    const step = 4 + i;
    onP('inputs', `Preparing ${plan.circuitName}...`);
    const disclosureInputs = await timed(
      `inputs.${plan.circuitName}`,
      () => plan.buildInputs(passport as any, saltsOut as any, nullifierSecret, serviceScope, serviceSubscope, currentDateTimestamp),
      plan.circuitName,
    );
    if (!disclosureInputs) {
      console.error(`[ProofGenerator] disclosureInputs is null/undefined for ${plan.circuitName}`);
      console.error('[ProofGenerator] Query:', JSON.stringify(normalizedQuery, null, 2));
      throw new Error(`Could not derive inputs for ${plan.circuitName}`);
    }
    onP('prove', `[${step}/${3 + disclosureCount}] ${plan.circuitName}`);
    const proof = await fetchAndProveInnerCircuit(registry, manifest, plan.circuitName, disclosureInputs, onP);
    assertDisclosureCommInMatchesIntegrityOut(
      plan.circuitName,
      integrityProof.publicInputs,
      integrityProof.proof,
      proof.publicInputs,
      proof.proof,
    );
    disclosureProofs.push({ circuitName: plan.circuitName, ...proof });
    onP('prove', `  ✅ ${plan.circuitName}`);
  }
  onP('outer', `Skipping on-device ${outerName}; package ready for server aggregation`);

  return {
    version: manifest.version,
    currentDate: currentDateTimestamp,
    dsc: { circuitName: dscName, ...dscProof },
    idData: { circuitName: idDataName, ...idProof },
    integrity: { circuitName: integrityName, ...integrityProof },
    disclosures: disclosureProofs,
  };
}

export async function preloadCoreProofAssets(onP: ProgressFn): Promise<void> {
  const registry = new RegistryClient({ chainId: CHAIN_ID });

  onP('startup', 'Loading circuit manifest...');
  const manifest = await timed('startup.manifest', () => ensureManifest(registry), CIRCUIT_VERSION);
  onP('startup', `Manifest ${manifest.version} ready`);

  onP('startup', 'Loading certificate registry...');
  const certRoot = await timed('startup.certificates.root', () => registry.getLatestCertificateRoot());
  const certs = await timed('startup.certificates', () => ensureCertificates(registry, certRoot), certRoot);
  onP('startup', `Certificates ready (${certs.certificates?.length || 0})`);

  onP('startup', 'Caching common proof circuits...');
  const baselineSizes: number[] = [];
  for (const name of STARTUP_BASELINE_CIRCUITS) {
    const size = Number(manifest?.circuits?.[name]?.size || 0);
    baselineSizes.push(size);
    await timed(`startup.circuit.${name}`, () => ensurePreparedCircuit(registry, manifest, name), name);
    onP('startup', `Cached ${name}`);
  }

  onP('startup', 'Preparing proving CRS...');
  await timed('startup.crs', () => ensureCrsFilesForCircuits(baselineSizes, onP), `${baselineSizes.length} circuits`);
  onP('startup', 'Device proof data is ready');
}

export async function preloadRequestProofAssets(requestQuery: Query | null | undefined, onP: ProgressFn): Promise<void> {
  const registry = new RegistryClient({ chainId: CHAIN_ID });
  const manifest = await timed('request.manifest', () => ensureManifest(registry), CIRCUIT_VERSION);
  const query = normalizeRequestQuery(requestQuery);
  const plans = buildDisclosurePlans(query);
  const sizes: number[] = [];

  for (const plan of plans) {
    const size = Number(manifest?.circuits?.[plan.circuitName]?.size || 0);
    sizes.push(size);
    await timed(`request.circuit.${plan.circuitName}`, () => ensurePreparedCircuit(registry, manifest, plan.circuitName), plan.circuitName);
    onP('startup', `Cached ${plan.circuitName}`);
  }

  if (sizes.length > 0) {
    await timed('request.crs', () => ensureCrsFilesForCircuits(sizes, onP), `${sizes.length} circuits`);
  }
}

async function fetchAndProveInnerCircuit(registry: RegistryClient, manifest: any, name: string, inputs: Record<string, any>, onP: ProgressFn): Promise<OuterCircuitProof> {
  const ch = manifest?.circuits?.[name]?.hash;
  if (!ch) {throw new Error(`No circuit hash in manifest for ${name}`);}
  onP('download', `Circuit ${name} (cache or network)...`);
  const prepared = await timed(`circuit.ready.${name}`, () => ensurePreparedCircuit(registry, manifest, name), name);
  onP('download', `  ${name} OK`);
  return await proveInnerCircuit(name, prepared, inputs, manifest);
}

async function ensureManifest(registry: RegistryClient): Promise<any> {
  const memoized = sessionManifestCache.get(CIRCUIT_VERSION);
  if (memoized?.circuits && memoized?.version) {
    return memoized;
  }
  let manifest: any = await readCachedManifest(CIRCUIT_VERSION);
  if (!manifest?.circuits || !manifest?.version) {
    manifest = await registry.getCircuitManifest(undefined, { version: CIRCUIT_VERSION, validate: false });
    await writeCachedManifest(CIRCUIT_VERSION, manifest);
  }
  sessionManifestCache.set(CIRCUIT_VERSION, manifest);
  return manifest;
}

async function ensureCertificates(registry: RegistryClient, certRoot: string): Promise<any> {
  const memoized = sessionCertificatesCache.get(certRoot);
  if (memoized?.certificates?.length) {
    return memoized;
  }
  let packagedCerts: any = await readCachedCertificates(certRoot);
  if (!packagedCerts?.certificates?.length) {
    packagedCerts = await registry.getCertificates(certRoot, { validate: false });
    await writeCachedCertificates(certRoot, packagedCerts);
  }
  sessionCertificatesCache.set(certRoot, packagedCerts);
  return packagedCerts;
}

async function ensurePackagedCircuit(registry: RegistryClient, manifest: any, name: string): Promise<any> {
  const ch = manifest?.circuits?.[name]?.hash;
  if (!ch) {throw new Error(`No circuit hash in manifest for ${name}`);}
  const cached = sessionPackagedCircuitCache.get(String(ch));
  if (cached?.bytecode && cached?.vkey) {
    return cached;
  }
  let art: any = await readCachedPackagedCircuit(String(ch));
  if (!art?.bytecode || !art?.vkey) {
    art = await registry.getPackagedCircuit(name, manifest, { validate: false });
    await writeCachedPackagedCircuit(String(ch), art);
  }
  sessionPackagedCircuitCache.set(String(ch), art);
  return art;
}

async function ensurePreparedCircuit(registry: RegistryClient, manifest: any, name: string): Promise<PreparedCircuitArtifact> {
  const ch = String(manifest?.circuits?.[name]?.hash || '');
  if (!ch) {throw new Error(`No circuit hash in manifest for ${name}`);}
  const cached = sessionPreparedCircuitCache.get(ch);
  if (cached) {
    return cached;
  }

  const art = await ensurePackagedCircuit(registry, manifest, name);
  const prepared = await timed(`circuit.decode.${name}`, async () => {
    const bytecode = decompressBytecode(new Uint8Array(Buffer.from(art.bytecode, 'base64')));
    const vkey = new Uint8Array(Buffer.from(art.vkey, 'base64'));
    return {
      packaged: art,
      bytecode,
      vkey,
      vkeyFields: ultraVkToFields(vkey),
      expectedPublicInputs: getNumberOfPublicInputsFromVkey(vkey),
    };
  }, name);
  sessionPreparedCircuitCache.set(ch, prepared);
  return prepared;
}

async function proveInnerCircuit(name: string, prepared: PreparedCircuitArtifact, inputs: Record<string, any>, manifest: any): Promise<OuterCircuitProof> {
  const raw = await proveRawCircuit(name, prepared, inputs);
  const tree = await computeCircuitMerkleProofForName(manifest, name);
  return {
    proof: raw.proof,
    publicInputs: raw.publicInputs,
    vkey: prepared.vkeyFields,
    keyHash: prepared.packaged.vkey_hash,
    treeHashPath: tree.path,
    treeIndex: String(tree.index),
  };
}

async function proveRawCircuit(name: string, prepared: PreparedCircuitArtifact, inputs: Record<string, any>): Promise<{ proof: string[]; publicInputs: string[] }> {
  let witness: Uint8Array | undefined;
  try {
    witness = await timed(`witness.${name}`, () => solveCompressedWitness({
      bytecode: prepared.packaged.bytecode,
      abi: prepared.packaged.abi,
      debug_symbols: prepared.packaged.debug_symbols ?? '',
      file_map: prepared.packaged.file_map && typeof prepared.packaged.file_map === 'object' ? prepared.packaged.file_map : {},
      inputs,
    }), name);
    const result = await timed(`prove.${name}`, () => circuitProve(prepared.bytecode, witness!, prepared.vkey, name), name);
    const proof = (result.proof || []).map(toFieldHex);
    const publicInputs = (result.public_inputs || []).map(toFieldHex);
    if (prepared.expectedPublicInputs !== publicInputs.length) {
      console.warn(`${name}: vkey public inputs=${prepared.expectedPublicInputs}, actual=${publicInputs.length}`);
    }
    return { proof, publicInputs };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error(`[ProofGenerator] ${name} failed: ${msg}`);
    if (err?.stack) {console.error(err.stack);}
    throw new Error(`${name} failed: ${msg}`);
  } finally {
    if (witness) {witness = new Uint8Array(0);}
  }
}

async function computeCircuitMerkleProofForName(manifest: any, name: string): Promise<{ path: string[]; index: number }> {
  const circuitHash = manifest.circuits?.[name]?.hash;
  if (!circuitHash) {throw new Error(`Circuit ${name} not found in manifest`);}
  const cached = sessionMerkleProofCache.get(String(circuitHash));
  if (cached) {
    return cached;
  }
  const proof = await timed(`merkle.${name}`, () => getCircuitMerkleProof(circuitHash, manifest), name);
  const normalized = {
    path: proof.path.map((x: any) => (typeof x === 'string' ? x : `0x${BigInt(x).toString(16).padStart(64, '0')}`)),
    index: proof.index,
  };
  sessionMerkleProofCache.set(String(circuitHash), normalized);
  return normalized;
}

function toFieldHex(value: any): string {
  if (typeof value === 'string') {return value.startsWith('0x') ? value : `0x${value}`;}
  if (value instanceof Uint8Array) {return `0x${Buffer.from(value).toString('hex')}`;}
  if (Array.isArray(value) && value.every((x) => typeof x === 'number')) {return `0x${Buffer.from(value).toString('hex')}`;}
  return `0x${BigInt(value).toString(16)}`;
}

function decompressBytecode(data: Uint8Array): Uint8Array {
  if (data.length > 2 && data[0] === 0x1f && data[1] === 0x8b) {
    try {
      return pako.ungzip(data);
    } catch {
      return data;
    }
  }
  return data;
}

function buildPassportViewModel(pd: PassportData): any {
  const dg1 = Binary.fromBase64(pd.dg1);
  const sod = SOD.fromDER(Binary.fromBase64(pd.sod));
  const mrz = extractMrzFromDG1(Buffer.from(pd.dg1, 'base64'));
  const mrzFields = parseMrz(mrz);
  const dgv = sod.encapContentInfo.eContent.dataGroupHashValues.values;
  const ldsHashAlgo = String(sod.encapContentInfo.eContent.hashAlgorithm);
  const dg1HashFromSod = dgv[1];
  const dg1HashArray = dg1HashFromSod
    ? dg1HashFromSod.toNumberArray()
    : Array.from(sha256(dg1.toUInt8Array()));
  const dg2FromSod = dgv[2];
  const dg2Group = pd.dg2
    ? (() => {
        const raw = Binary.fromBase64(pd.dg2!);
        return {
          groupNumber: 2,
          name: 'DG2',
          hash: dg2FromSod ? dg2FromSod.toNumberArray() : Array.from(sha256(raw.toUInt8Array())),
          value: raw.toNumberArray(),
        };
      })()
    : {
        groupNumber: 2,
        name: 'DG2',
        hash: dg2FromSod ? dg2FromSod.toNumberArray() : Array(32).fill(0),
        value: [],
      };
  return {
    dateOfIssue: '',
    appVersion: '',
    mrz,
    name: `${mrzFields.firstName} ${mrzFields.lastName}`.trim(),
    dateOfBirth: mrzFields.dateOfBirth,
    nationality: mrzFields.nationality,
    gender: mrzFields.gender,
    passportNumber: mrzFields.documentNumber,
    passportExpiry: mrzFields.expiryDate,
    firstName: mrzFields.firstName,
    lastName: mrzFields.lastName,
    fullName: `${mrzFields.firstName} ${mrzFields.lastName}`.trim(),
    photo: '',
    originalPhoto: '',
    chipAuthSupported: false,
    chipAuthSuccess: false,
    chipAuthFailed: false,
    LDSVersion: '',
    documentType: mrz.length === 88 ? 'passport' : 'id_card',
    dataGroups: [
      {
        groupNumber: 1,
        name: 'DG1',
        hash: dg1HashArray,
        value: dg1.toNumberArray(),
      },
      dg2Group,
    ],
    dataGroupsHashAlgorithm: ldsHashAlgo,
    sod,
  };
}

type DisclosurePlan = {
  circuitName: string;
  buildInputs: (
    passport: any,
    saltsOut: any,
    nullifierSecret: bigint,
    serviceScope: bigint,
    serviceSubscope: bigint,
    currentDateTimestamp: number,
  ) => Promise<Record<string, any> | null>;
};

// Standard zkPassport fields + extended fields
const ALLOWED_QUERY_FIELDS = new Set([
  // MRZ fields (DG1) - supported by ZK circuits
  'age', 'nationality', 'issuing_country', 'firstname', 'lastname', 'fullname',
  'birthdate', 'expiry_date', 'document_number', 'document_type', 'gender',
  'optional_data_1', 'optional_data_2',
  // DG11 fields - info only, not processed by ZK circuits (require raw data verification)
  'place_of_birth', 'permanent_address', 'personal_number', 'full_date_of_birth',
  'full_name_of_holder', 'personal_number_dg11',
]);

// DG11 fields that are informational only (not processed by ZK circuits)
const DG11_INFO_FIELDS = new Set([
  'place_of_birth', 'permanent_address', 'personal_number', 'full_date_of_birth',
  'full_name_of_holder', 'personal_number_dg11',
]);

// Fields that the standard SDK handles
const STANDARD_DISCLOSE_FIELDS = new Set([
  'firstname', 'lastname', 'fullname', 'birthdate', 'document_number',
  'nationality', 'document_type', 'expiry_date', 'gender', 'issuing_country',
]);

function normalizeRequestQuery(query?: ExtendedQuery | null): ExtendedQuery {
  const q = (query && typeof query === 'object') ? query : {};
  const filtered: Record<string, any> = {};

  for (const key of Object.keys(q as any)) {
    if (!ALLOWED_QUERY_FIELDS.has(key)) {
      throw new Error(`Unsupported request query key: ${key}`);
    }
    // Skip DG11 fields - they're informational only and can't be processed by ZK circuits
    if (DG11_INFO_FIELDS.has(key)) {
      console.log(`[ProofGenerator] Skipping DG11 field (info only): ${key}`);
      continue;
    }
    filtered[key] = (q as any)[key];
  }

  if (Object.keys(filtered).length === 0) {
    return { nationality: { disclose: true } } as ExtendedQuery;
  }
  return filtered as ExtendedQuery;
}

// Check if query has any extended fields that need custom handling
function hasExtendedDiscloseFields(query: ExtendedQuery): boolean {
  return !!(
    (query.optional_data_1 && query.optional_data_1.disclose) ||
    (query.optional_data_2 && query.optional_data_2.disclose)
  );
}

// Build custom disclose_mask that includes optional_data fields
function buildExtendedDiscloseMask(passport: any, query: ExtendedQuery): number[] {
  const mrzLength = passport.mrz?.length || 90;
  const format = getMrzFormat(mrzLength);
  const ranges = MRZ_FIELD_RANGES[format];
  const mask = new Array(90).fill(0);

  // Standard fields
  for (const [field, cfg] of Object.entries(query)) {
    if (!cfg || typeof cfg !== 'object') {continue;}
    const config = cfg as { disclose?: boolean; eq?: any };
    if (!config.disclose && !config.eq) {continue;}

    // Handle standard fields
    if (STANDARD_DISCLOSE_FIELDS.has(field)) {
      const range = (ranges as any)[field === 'birthdate' ? 'birthdate' : field];
      if (range) {
        mask.fill(1, range[0], range[1]);
      }
    }
  }

  // Extended fields - optional_data_1 and optional_data_2
  if (query.optional_data_1?.disclose && ranges.optional_data_1) {
    mask.fill(1, ranges.optional_data_1[0], ranges.optional_data_1[1]);
  }
  if (query.optional_data_2?.disclose && (ranges as any).optional_data_2) {
    mask.fill(1, (ranges as any).optional_data_2[0], (ranges as any).optional_data_2[1]);
  }

  return mask;
}

// Custom disclosure circuit inputs builder that handles extended fields
async function getExtendedDiscloseCircuitInputs(
  passport: any,
  query: ExtendedQuery,
  salts: any,
  nullifierSecret: bigint,
  serviceScope: bigint,
  serviceSubscope: bigint,
  currentDateTimestamp: number,
): Promise<Record<string, any> | null> {
  // Build a base query for the SDK (without extended fields, but with at least one standard field)
  const baseQuery: Record<string, any> = {};
  for (const [field, cfg] of Object.entries(query)) {
    if (STANDARD_DISCLOSE_FIELDS.has(field) && cfg && typeof cfg === 'object') {
      baseQuery[field] = cfg;
    }
  }
  // Ensure we have at least one field for the SDK to work with
  if (Object.keys(baseQuery).length === 0) {
    baseQuery.nationality = { disclose: true };
  }

  console.log('[getExtendedDiscloseCircuitInputs] Getting base inputs from SDK with query:', Object.keys(baseQuery));
  console.log('[getExtendedDiscloseCircuitInputs] nullifierSecret:', nullifierSecret, '(should be 0n for passport-derived nullifier)');

  try {
    // Get base inputs from SDK - nullifierSecret=0n means nullifier is computed from passport data
    const baseInputs = await getDiscloseCircuitInputs(
      passport, baseQuery as Query, salts, nullifierSecret,
      serviceScope, serviceSubscope, currentDateTimestamp
    );

    if (!baseInputs) {
      console.error('[getExtendedDiscloseCircuitInputs] SDK getDiscloseCircuitInputs returned null');
      return null;
    }

    console.log('[getExtendedDiscloseCircuitInputs] Got base inputs from SDK');

    // If we have extended fields, override the mask
    if (hasExtendedDiscloseFields(query)) {
      console.log('[getExtendedDiscloseCircuitInputs] Building extended mask for optional_data fields');
      const extendedMask = buildExtendedDiscloseMask(passport, query);
      console.log('[getExtendedDiscloseCircuitInputs] Extended mask has', extendedMask.filter(x => x === 1).length, 'disclosed bytes');
      return {
        ...baseInputs,
        disclose_mask: extendedMask,
      };
    }

    return baseInputs as any;
  } catch (sdkError) {
    console.error('[getExtendedDiscloseCircuitInputs] SDK getDiscloseCircuitInputs error:', sdkError);
    throw sdkError;
  }
}

function buildDisclosurePlans(query: ExtendedQuery, walletAddress?: string): DisclosurePlan[] {
  const plans: DisclosurePlan[] = [];
  const hasDiscloseBytes = Object.entries(query as any).some(([, cfg]: any) => cfg?.disclose || cfg?.eq);
  if (hasDiscloseBytes) {
    plans.push({
      circuitName: 'disclose_bytes_evm',
      buildInputs: (passport, saltsOut, nullifierSecret, serviceScope, serviceSubscope, currentDateTimestamp) =>
        getExtendedDiscloseCircuitInputs(passport, query, saltsOut, nullifierSecret, serviceScope, serviceSubscope, currentDateTimestamp),
    });
  }
  if (query.age && (query.age.gte != null || query.age.gt != null || query.age.lte != null || query.age.lt != null || query.age.range != null || query.age.eq != null || query.age.disclose)) {
    plans.push({
      circuitName: 'compare_age_evm',
      buildInputs: (passport, saltsOut, nullifierSecret, serviceScope, serviceSubscope, currentDateTimestamp) =>
        getAgeCircuitInputs(passport, query as Query, saltsOut, nullifierSecret, serviceScope, serviceSubscope, currentDateTimestamp) as Promise<any>,
    });
  }
  if (query.nationality?.in) {
    plans.push({
      circuitName: 'inclusion_check_nationality_evm',
      buildInputs: (passport, saltsOut, nullifierSecret, serviceScope, serviceSubscope, currentDateTimestamp) =>
        getNationalityInclusionCircuitInputs(passport, query as Query, saltsOut, nullifierSecret, serviceScope, serviceSubscope, currentDateTimestamp) as Promise<any>,
    });
  }
  if (query.nationality?.out) {
    plans.push({
      circuitName: 'exclusion_check_nationality_evm',
      buildInputs: (passport, saltsOut, nullifierSecret, serviceScope, serviceSubscope, currentDateTimestamp) =>
        getNationalityExclusionCircuitInputs(passport, query as Query, saltsOut, nullifierSecret, serviceScope, serviceSubscope, currentDateTimestamp) as Promise<any>,
    });
  }
  if (query.issuing_country?.in) {
    plans.push({
      circuitName: 'inclusion_check_issuing_country_evm',
      buildInputs: (passport, saltsOut, nullifierSecret, serviceScope, serviceSubscope, currentDateTimestamp) =>
        getIssuingCountryInclusionCircuitInputs(passport, query as Query, saltsOut, nullifierSecret, serviceScope, serviceSubscope, currentDateTimestamp) as Promise<any>,
    });
  }
  if (query.issuing_country?.out) {
    plans.push({
      circuitName: 'exclusion_check_issuing_country_evm',
      buildInputs: (passport, saltsOut, nullifierSecret, serviceScope, serviceSubscope, currentDateTimestamp) =>
        getIssuingCountryExclusionCircuitInputs(passport, query as Query, saltsOut, nullifierSecret, serviceScope, serviceSubscope, currentDateTimestamp) as Promise<any>,
    });
  }
  // Add bind circuit if wallet address is provided
  if (walletAddress) {
    const bindQuery: Query = {
      ...query as Query,
      bind: { user_address: walletAddress } as BoundData,
    };
    plans.push({
      circuitName: 'bind_evm',
      buildInputs: (passport, saltsOut, nullifierSecret, serviceScope, serviceSubscope, currentDateTimestamp) =>
        getBindCircuitInputs(passport, bindQuery, saltsOut, nullifierSecret, serviceScope, serviceSubscope, currentDateTimestamp) as Promise<any>,
    });
  }
  if (plans.length === 0) {
    throw new Error('Request query produced no supported disclosure circuits');
  }
  if (plans.length > 10) {
    throw new Error(`Too many disclosure proofs requested: ${plans.length} (max 10)`);
  }
  return plans;
}

async function deriveCircuitNames(passport: any, packagedCerts: any, manifest: any, outerName: string) {
  const tbsBucket = getTBSMaxLen(passport);
  const csca = await getCscaForPassportAsync(passport.sod.certificate, packagedCerts.certificates);
  if (!csca) {throw new Error('Could not match CSCA from certificate registry');}

  const dscHash = normalizeHashName(String(getDSCSignatureHashAlgorithm(passport.sod.certificate) || 'SHA256'));
  const sodHash = normalizeHashName(String(getSodSignatureAlgorithmHashAlgorithm(passport) || 'sha256'));

  let dscName: string;
  if (csca.signature_algorithm === 'ECDSA' && csca.public_key.type === 'EC') {
    dscName = `sig_check_dsc_tbs_${tbsBucket}_ecdsa_${curveToCircuitToken(csca.public_key.curve)}_${dscHash}`;
  } else if (csca.signature_algorithm === 'RSA-PSS' && csca.public_key.type === 'RSA') {
    dscName = `sig_check_dsc_tbs_${tbsBucket}_rsa_pss_${csca.public_key.key_size}_${dscHash}`;
  } else if (csca.signature_algorithm === 'RSA' && csca.public_key.type === 'RSA') {
    dscName = `sig_check_dsc_tbs_${tbsBucket}_rsa_pkcs_${csca.public_key.key_size}_${dscHash}`;
  } else {
    throw new Error(`Unsupported CSCA signature/public key combo: ${csca.signature_algorithm}/${csca.public_key.type}`);
  }

  const tbs = extractTBS(passport);
  if (!tbs) {throw new Error('Could not extract DSC TBS certificate');}
  const spki = tbs.subjectPublicKeyInfo;
  const sodSigAlg = String(passport.sod.signerInfo.signatureAlgorithm.name || '').toLowerCase();

  let idDataName: string;
  if (sodSigAlg.includes('ecdsa')) {
    const ecdsaInfo = getECDSAInfo(spki);
    idDataName = `sig_check_id_data_tbs_${tbsBucket}_ecdsa_${curveToCircuitToken(ecdsaInfo.curve)}_${sodHash}`;
  } else {
    const rsaInfo = getRSAInfo(spki);
    const keySize = BigInt(rsaInfo.modulus).toString(2).length;
    const mode = sodSigAlg.includes('pss') ? 'rsa_pss' : 'rsa_pkcs';
    idDataName = `sig_check_id_data_tbs_${tbsBucket}_${mode}_${keySize}_${sodHash}`;
  }

  const dgHash = normalizeHashName(String(passport.sod.encapContentInfo.eContent.hashAlgorithm || 'SHA256'));
  const integrityName = `data_check_integrity_sa_${sodHash}_dg_${dgHash}`;

  for (const name of [dscName, idDataName, integrityName, outerName]) {
    if (!manifest?.circuits?.[name]) {
      throw new Error(`Derived circuit not found in manifest: ${name}`);
    }
  }

  return {
    dscName,
    idDataName,
    integrityName,
    outerName,
    debug: {
      dsc: `${csca.signature_algorithm}/${csca.public_key.type}/${csca.public_key.type === 'EC' ? csca.public_key.curve : csca.public_key.key_size}/${dscHash}`,
      id: `${sodSigAlg.includes('ecdsa') ? 'ECDSA' : sodSigAlg.includes('pss') ? 'RSA-PSS' : 'RSA-PKCS'}/${sodHash}`,
    },
  };
}

function extractMrzFromDG1(dg1: Uint8Array): string {
  for (let i = 0; i < dg1.length - 2; i++) {
    if (dg1[i] === 0x5f && dg1[i + 1] === 0x1f) {
      const len = dg1[i + 2];
      const start = i + 3;
      if (start + len <= dg1.length) {return Buffer.from(dg1.slice(start, start + len)).toString('ascii');}
    }
  }
  return Buffer.from(dg1).toString('ascii');
}

function parseMrz(mrz: string) {
  const clean = mrz.replace(/\n/g, '').replace(/ /g, '');
  if (clean.length >= 88 && clean[0] === 'P') {
    const names = clean.slice(5, 44).split('<<');
    return {
      issuingCountry: clean.slice(2, 5).replace(/</g, ''),
      documentNumber: clean.slice(44, 53).replace(/</g, ''),
      nationality: clean.slice(54, 57).replace(/</g, ''),
      dateOfBirth: clean.slice(57, 63),
      gender: clean.slice(64, 65).replace(/</g, ''),
      expiryDate: clean.slice(65, 71),
      lastName: (names[0] || '').replace(/</g, ' ').trim(),
      firstName: (names[1] || '').replace(/</g, ' ').trim(),
    };
  }
  const line1 = clean.slice(0, 30);
  const line2 = clean.slice(30, 60);
  const line3 = clean.slice(60, 90);
  const names = line3.split('<<');
  return {
    issuingCountry: line1.slice(2, 5).replace(/</g, ''),
    documentNumber: line1.slice(5, 14).replace(/</g, ''),
    nationality: line2.slice(15, 18).replace(/</g, ''),
    dateOfBirth: line2.slice(0, 6),
    gender: line2.slice(7, 8).replace(/</g, ''),
    expiryDate: line2.slice(8, 14),
    lastName: (names[0] || '').replace(/</g, ' ').trim(),
    firstName: (names[1] || '').replace(/</g, ' ').trim(),
  };
}

function normalizeHashName(value: string): string {
  const v = value.toLowerCase().replace(/-/g, '');
  if (v.includes('512')) {return 'sha512';}
  if (v.includes('384')) {return 'sha384';}
  if (v.includes('224')) {return 'sha224';}
  if (v.includes('1')) {return 'sha1';}
  return 'sha256';
}

function curveToCircuitToken(curve: string): string {
  const map: Record<string, string> = {
    'P-192': 'nist_p192',
    'P-224': 'nist_p224',
    'P-256': 'nist_p256',
    'P-384': 'nist_p384',
    'P-521': 'nist_p521',
    brainpoolP160r1: 'brainpool_160r1',
    brainpoolP160t1: 'brainpool_160t1',
    brainpoolP192r1: 'brainpool_192r1',
    brainpoolP192t1: 'brainpool_192t1',
    brainpoolP224r1: 'brainpool_224r1',
    brainpoolP224t1: 'brainpool_224t1',
    brainpoolP256r1: 'brainpool_256r1',
    brainpoolP256t1: 'brainpool_256t1',
    brainpoolP320r1: 'brainpool_320r1',
    brainpoolP320t1: 'brainpool_320t1',
    brainpoolP384r1: 'brainpool_384r1',
    brainpoolP384t1: 'brainpool_384t1',
    brainpoolP512r1: 'brainpool_512r1',
    brainpoolP512t1: 'brainpool_512t1',
  };
  const token = map[curve];
  if (!token) {throw new Error(`Unsupported ECDSA curve for circuit selection: ${curve}`);}
  return token;
}

function randomBigInt(): bigint {
  const b = new Uint8Array(31);
  for (let i = 0; i < b.length; i++) {b[i] = Math.floor(Math.random() * 256);}
  return BigInt(`0x${Buffer.from(b).toString('hex')}`);
}
