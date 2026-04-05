import EncryptedStorage from 'react-native-encrypted-storage';
import { Buffer } from 'buffer';

const IDS_STORAGE_KEY = 'vocdoni_stored_ids';

export interface StoredID {
  id: string;
  createdAt: number;
  dg1: string;
  sod: string;
  dg2?: string;
  documentType: 'passport' | 'id_card';
  documentNumber: string;
  firstName: string;
  lastName: string;
  nationality: string;
  issuingCountry: string;
  dateOfBirth: string;
  expiryDate: string;
  gender: string;
  photo?: string;
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
  dg2Base64?: string,
): Omit<StoredID, 'id' | 'createdAt'> {
  const dg1 = Buffer.from(dg1Base64, 'base64');
  const mrz = extractMrzFromDG1(dg1);
  const parsed = parseMrz(mrz);

  let photo: string | undefined;
  if (dg2Base64) {
    photo = extractPhotoFromDG2(dg2Base64);
  }

  return {
    dg1: dg1Base64,
    sod: sodBase64,
    dg2: dg2Base64,
    documentType: mrz.length >= 88 ? 'passport' : 'id_card',
    documentNumber: parsed.documentNumber,
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    nationality: parsed.nationality,
    issuingCountry: parsed.issuingCountry,
    dateOfBirth: formatDate(parsed.dateOfBirth),
    expiryDate: formatDate(parsed.expiryDate),
    gender: parsed.gender,
    photo,
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

function formatDate(yymmdd: string): string {
  if (yymmdd.length !== 6) {return yymmdd;}
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const century = yy > 50 ? '19' : '20';
  return `${century}${yymmdd.slice(0, 2)}-${mm}-${dd}`;
}

function extractPhotoFromDG2(dg2Base64: string): string | undefined {
  try {
    const dg2 = Buffer.from(dg2Base64, 'base64');
    const jpegStart = findJpegStart(dg2);
    if (jpegStart >= 0) {
      const jpegEnd = findJpegEnd(dg2, jpegStart);
      if (jpegEnd > jpegStart) {
        const jpeg = dg2.slice(jpegStart, jpegEnd + 2);
        return jpeg.toString('base64');
      }
    }
    const jp2Start = findJP2Start(dg2);
    if (jp2Start >= 0) {
      return dg2.slice(jp2Start).toString('base64');
    }
  } catch (error) {
    console.warn('[idStorage] Failed to extract photo from DG2:', error);
  }
  return undefined;
}

function findJpegStart(data: Uint8Array): number {
  for (let i = 0; i < data.length - 1; i++) {
    if (data[i] === 0xff && data[i + 1] === 0xd8) {return i;}
  }
  return -1;
}

function findJpegEnd(data: Uint8Array, start: number): number {
  for (let i = start + 2; i < data.length - 1; i++) {
    if (data[i] === 0xff && data[i + 1] === 0xd9) {return i;}
  }
  return -1;
}

function findJP2Start(data: Uint8Array): number {
  const jp2Signature = [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20];
  for (let i = 0; i < data.length - jp2Signature.length; i++) {
    let match = true;
    for (let j = 0; j < jp2Signature.length; j++) {
      if (data[i + j] !== jp2Signature[j]) {
        match = false;
        break;
      }
    }
    if (match) {return i;}
  }
  return -1;
}
