import React, { createContext, useContext, useCallback, useState, useEffect, type PropsWithChildren } from 'react';
import {
  hasWallet,
  getWalletInfo,
  createWallet,
  restoreWallet,
  getWalletPhrase,
  getWalletAddress,
  markWalletBackedUp,
  deleteWallet,
  isValidMnemonic,
  type StoredWalletInfo,
  type WalletData,
} from '../services/WalletService';

export type WalletStatus = 'checking' | 'no_wallet' | 'ready';

interface WalletContextValue {
  status: WalletStatus;
  walletInfo: StoredWalletInfo | null;
  address: string | null;
  
  // Actions
  createNewWallet: () => Promise<WalletData | null>;
  restoreFromPhrase: (phrase: string) => Promise<WalletData | null>;
  getPhrase: () => Promise<string | null>;
  markBackedUp: () => Promise<void>;
  resetWallet: () => Promise<boolean>;
  refreshWalletState: () => Promise<void>;
  
  // Validation
  validateMnemonic: (phrase: string) => boolean;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<WalletStatus>('checking');
  const [walletInfo, setWalletInfo] = useState<StoredWalletInfo | null>(null);

  const checkWalletState = useCallback(async () => {
    try {
      const exists = await hasWallet();
      if (exists) {
        const info = await getWalletInfo();
        setWalletInfo(info);
        setStatus('ready');
      } else {
        setWalletInfo(null);
        setStatus('no_wallet');
      }
    } catch (error) {
      console.error('[WalletContext] Failed to check wallet state:', error);
      setStatus('no_wallet');
    }
  }, []);

  useEffect(() => {
    checkWalletState();
  }, [checkWalletState]);

  const createNewWallet = useCallback(async (): Promise<WalletData | null> => {
    try {
      const wallet = await createWallet();
      if (wallet) {
        await checkWalletState();
      }
      return wallet;
    } catch (error) {
      console.error('[WalletContext] Failed to create wallet:', error);
      return null;
    }
  }, [checkWalletState]);

  const restoreFromPhrase = useCallback(async (phrase: string): Promise<WalletData | null> => {
    try {
      const wallet = await restoreWallet(phrase);
      if (wallet) {
        await checkWalletState();
      }
      return wallet;
    } catch (error) {
      console.error('[WalletContext] Failed to restore wallet:', error);
      return null;
    }
  }, [checkWalletState]);

  const getPhrase = useCallback(async (): Promise<string | null> => {
    return getWalletPhrase();
  }, []);

  const markBackedUp = useCallback(async (): Promise<void> => {
    await markWalletBackedUp();
    await checkWalletState();
  }, [checkWalletState]);

  const resetWallet = useCallback(async (): Promise<boolean> => {
    const result = await deleteWallet();
    if (result) {
      setWalletInfo(null);
      setStatus('no_wallet');
    }
    return result;
  }, []);

  const refreshWalletState = useCallback(async (): Promise<void> => {
    await checkWalletState();
  }, [checkWalletState]);

  const validateMnemonic = useCallback((phrase: string): boolean => {
    return isValidMnemonic(phrase);
  }, []);

  const value: WalletContextValue = {
    status,
    walletInfo,
    address: walletInfo?.address || null,
    createNewWallet,
    restoreFromPhrase,
    getPhrase,
    markBackedUp,
    resetWallet,
    refreshWalletState,
    validateMnemonic,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
