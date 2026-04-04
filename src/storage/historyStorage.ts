import EncryptedStorage from 'react-native-encrypted-storage';

const HISTORY_STORAGE_KEY = 'vocdoni_signature_history';

export interface SignatureRecord {
  id: string;
  timestamp: number;
  serviceName: string;
  serviceUrl?: string;
  petitionId?: string;
  purpose?: string;
  disclosedFields: string[];
  rules: string[];
  success: boolean;
  nullifier?: string;
  durationMs: number;
  usedIdRef: string;
  usedIdLabel: string;
}

export async function getAllSignatures(): Promise<SignatureRecord[]> {
  try {
    const data = await EncryptedStorage.getItem(HISTORY_STORAGE_KEY);
    if (!data) {
      console.log('[historyStorage] No history found');
      return [];
    }
    const records = JSON.parse(data) as SignatureRecord[];
    console.log('[historyStorage] Loaded', records.length, 'signatures');
    return records.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('[historyStorage] Failed to read history:', error);
    return [];
  }
}

export async function getSignatureById(id: string): Promise<SignatureRecord | null> {
  const records = await getAllSignatures();
  return records.find((item) => item.id === id) || null;
}

export async function saveSignature(record: SignatureRecord): Promise<void> {
  try {
    console.log('[historyStorage] Saving signature:', record.id, record.serviceName);
    const records = await getAllSignatures();
    const existingIndex = records.findIndex((item) => item.id === record.id);
    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.unshift(record);
    }
    const trimmed = records.slice(0, 100);
    await EncryptedStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
    console.log('[historyStorage] Signature saved successfully, total:', trimmed.length);
  } catch (error) {
    console.error('[historyStorage] Failed to save signature:', error);
    throw error;
  }
}

export async function deleteSignature(id: string): Promise<void> {
  try {
    const records = await getAllSignatures();
    const filtered = records.filter((item) => item.id !== id);
    await EncryptedStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('[historyStorage] Failed to delete signature:', error);
    throw error;
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await EncryptedStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch (error) {
    console.error('[historyStorage] Failed to clear history:', error);
    throw error;
  }
}

export function generateSignatureId(): string {
  return `sig_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function groupSignaturesByDate(records: SignatureRecord[]): Map<string, SignatureRecord[]> {
  const groups = new Map<string, SignatureRecord[]>();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;

  for (const record of records) {
    const recordDate = new Date(record.timestamp);
    const recordDay = new Date(recordDate.getFullYear(), recordDate.getMonth(), recordDate.getDate()).getTime();
    
    let key: string;
    if (recordDay >= today) {
      key = 'Today';
    } else if (recordDay >= yesterday) {
      key = 'Yesterday';
    } else {
      key = recordDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    
    const existing = groups.get(key) || [];
    existing.push(record);
    groups.set(key, existing);
  }
  
  return groups;
}
