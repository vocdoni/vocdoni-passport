import EncryptedStorage from 'react-native-encrypted-storage';
import { Buffer } from 'buffer';

const IDS_STORAGE_KEY = 'vocdoni_stored_ids';

export interface StoredID {
  id: string;
  createdAt: number;
  dg1: string;
  sod: string;
  documentType: 'passport' | 'id_card';
  mrzDocCode?: string;
  documentNumber: string;
  firstName: string;
  lastName: string;
  nationality: string;
  issuingCountry: string;
  dateOfBirth: string;
  expiryDate: string;
  gender: string;
}

export async function getAllIDs(): Promise<StoredID[]> {
  try {
    const data = await EncryptedStorage.getItem(IDS_STORAGE_KEY);
    if (!data) {return [];}
    return JSON.parse(data) as StoredID[];
  } catch (error) {
    console.error('[idStorage] Failed to read IDs:', error);
    return [];
  }
}

export async function getIDById(id: string): Promise<StoredID | null> {
  const ids = await getAllIDs();
  return ids.find((item) => item.id === id) || null;
}

export async function saveID(id: StoredID): Promise<void> {
  const ids = await getAllIDs();
  const existingIndex = ids.findIndex((item) => item.id === id.id);
  if (existingIndex >= 0) {
    ids[existingIndex] = id;
  } else {
    ids.push(id);
  }
  await EncryptedStorage.setItem(IDS_STORAGE_KEY, JSON.stringify(ids));
}

export async function deleteID(id: string): Promise<void> {
  const ids = await getAllIDs();
  const filtered = ids.filter((item) => item.id !== id);
  await EncryptedStorage.setItem(IDS_STORAGE_KEY, JSON.stringify(filtered));
}

export async function hasStoredIDs(): Promise<boolean> {
  const ids = await getAllIDs();
  return ids.length > 0;
}

export function generateIDId(): string {
  return `id_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function parsePassportData(
  dg1Base64: string,
  sodBase64: string,
): Omit<StoredID, 'id' | 'createdAt'> {
  const dg1 = Buffer.from(dg1Base64, 'base64');
  const mrz = extractMrzFromDG1(dg1);
  const parsed = parseMrz(mrz);

  return {
    dg1: dg1Base64,
    sod: sodBase64,
    documentType: parsed.mrzDocCode[0] === 'P' ? 'passport' : 'id_card',
    mrzDocCode: parsed.mrzDocCode,
    documentNumber: parsed.documentNumber,
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    nationality: parsed.nationality,
    issuingCountry: parsed.issuingCountry,
    dateOfBirth: formatDate(parsed.dateOfBirth),
    expiryDate: formatDate(parsed.expiryDate),
    gender: parsed.gender,
  };
}

function extractMrzFromDG1(dg1: Uint8Array): string {
  for (let i = 0; i < dg1.length - 2; i++) {
    if (dg1[i] === 0x5f && dg1[i + 1] === 0x1f) {
      const len = dg1[i + 2];
      const start = i + 3;
      if (start + len <= dg1.length) {
        return Buffer.from(dg1.slice(start, start + len)).toString('ascii');
      }
    }
  }
  return Buffer.from(dg1).toString('ascii');
}

function parseMrz(mrz: string) {
  const clean = mrz.replace(/\n/g, '').replace(/ /g, '');
  // First 2 chars are the document code (e.g. "P<", "ID", "I<", "AC")
  // We preserve the raw chars (including '<') so callers can use [0] for type detection
  const mrzDocCode = clean.slice(0, 2);

  if (clean.length >= 88 && clean[0] === 'P') {
    const names = clean.slice(5, 44).split('<<');
    return {
      mrzDocCode,
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
    mrzDocCode,
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

function formatDate(yymmdd: string): string {
  if (yymmdd.length !== 6) {return yymmdd;}
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const century = yy > 50 ? '19' : '20';
  return `${century}${yymmdd.slice(0, 2)}-${mm}-${dd}`;
}

