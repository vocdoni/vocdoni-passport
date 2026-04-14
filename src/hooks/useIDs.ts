import { useCallback, useEffect, useState } from 'react';
import {
  getAllIDs,
  getIDById,
  saveID,
  deleteID as deleteStoredID,
  generateIDId,
  parsePassportData,
  type StoredID,
} from '../storage/idStorage';

export function useIDs() {
  const [ids, setIds] = useState<StoredID[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const storedIds = await getAllIDs();
      setIds(storedIds);
    } catch (err: any) {
      setError(err?.message || 'Failed to load IDs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addID = useCallback(async (
    dg1: string,
    sod: string,
  ): Promise<StoredID> => {
    const parsed = parsePassportData(dg1, sod);
    const newId: StoredID = {
      ...parsed,
      id: generateIDId(),
      createdAt: Date.now(),
    };
    await saveID(newId);
    await refresh();
    return newId;
  }, [refresh]);

  const deleteID = useCallback(async (id: string): Promise<void> => {
    await deleteStoredID(id);
    await refresh();
  }, [refresh]);

  const getID = useCallback(async (id: string): Promise<StoredID | null> => {
    return getIDById(id);
  }, []);

  return {
    ids,
    loading,
    error,
    refresh,
    addID,
    deleteID,
    getID,
    hasIDs: ids.length > 0,
  };
}
