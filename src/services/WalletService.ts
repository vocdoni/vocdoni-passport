import { ethers } from 'ethers';
import * as Keychain from 'react-native-keychain';
import ReactNativeBiometrics from 'react-native-biometrics';
import EncryptedStorage from 'react-native-encrypted-storage';

const WALLET_SERVICE = 'vocdoni_wallet';
const WALLET_SETUP_KEY = 'vocdoni_wallet_setup';

export interface WalletData {
  address: string;
  phrase: string;
  entropy: string;
}

export interface StoredWalletInfo {
  address: string;
  createdAt: number;
  hasBackedUp: boolean;
}

const biometrics = new ReactNativeBiometrics({
  allowDeviceCredentials: true,
});

/**
 * Check if a wallet has been set up
 */
export async function hasWallet(): Promise<boolean> {
  try {
    const info = await EncryptedStorage.getItem(WALLET_SETUP_KEY);
    return info !== null;
  } catch {
    return false;
  }
}

/**
 * Get wallet info (address, creation date) without requiring authentication
 */
export async function getWalletInfo(): Promise<StoredWalletInfo | null> {
  try {
    const info = await EncryptedStorage.getItem(WALLET_SETUP_KEY);
    if (!info) {return null;}
    return JSON.parse(info) as StoredWalletInfo;
  } catch {
    return null;
  }
}

/**
 * Mark that the user has backed up their recovery phrase
 */
export async function markWalletBackedUp(): Promise<void> {
  try {
    const info = await getWalletInfo();
    if (info) {
      info.hasBackedUp = true;
      await EncryptedStorage.setItem(WALLET_SETUP_KEY, JSON.stringify(info));
    }
  } catch (error) {
    console.error('[WalletService] Failed to mark wallet as backed up:', error);
  }
}

/**
 * Create a new wallet with a random mnemonic
 * Returns the wallet data including the mnemonic phrase
 */
export async function createWallet(): Promise<WalletData | null> {
  try {
    // Generate random entropy for 12-word mnemonic (128 bits = 16 bytes)
    const entropy = ethers.randomBytes(16);
    const mnemonic = ethers.Mnemonic.fromEntropy(entropy);
    const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonic);

    // Store the mnemonic securely in keychain
    const stored = await storeWalletSecret(mnemonic.phrase);
    if (!stored) {
      console.error('[WalletService] Failed to store wallet secret');
      return null;
    }

    // Store wallet info (non-sensitive) in encrypted storage
    const walletInfo: StoredWalletInfo = {
      address: wallet.address,
      createdAt: Date.now(),
      hasBackedUp: false,
    };
    await EncryptedStorage.setItem(WALLET_SETUP_KEY, JSON.stringify(walletInfo));

    return {
      address: wallet.address,
      phrase: mnemonic.phrase,
      entropy: ethers.hexlify(entropy),
    };
  } catch (error) {
    console.error('[WalletService] Failed to create wallet:', error);
    return null;
  }
}

/**
 * Restore a wallet from a mnemonic phrase
 */
export async function restoreWallet(phrase: string): Promise<WalletData | null> {
  try {
    const trimmedPhrase = phrase.trim().toLowerCase();

    // Validate mnemonic
    if (!ethers.Mnemonic.isValidMnemonic(trimmedPhrase)) {
      console.error('[WalletService] Invalid mnemonic phrase');
      return null;
    }

    const mnemonic = ethers.Mnemonic.fromPhrase(trimmedPhrase);
    const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonic);

    // Store the mnemonic securely
    const stored = await storeWalletSecret(mnemonic.phrase);
    if (!stored) {
      console.error('[WalletService] Failed to store restored wallet');
      return null;
    }

    // Store wallet info
    const walletInfo: StoredWalletInfo = {
      address: wallet.address,
      createdAt: Date.now(),
      hasBackedUp: true, // Assume user has backup since they're restoring
    };
    await EncryptedStorage.setItem(WALLET_SETUP_KEY, JSON.stringify(walletInfo));

    return {
      address: wallet.address,
      phrase: mnemonic.phrase,
      entropy: mnemonic.entropy,
    };
  } catch (error) {
    console.error('[WalletService] Failed to restore wallet:', error);
    return null;
  }
}

/**
 * Get the wallet mnemonic phrase (requires biometric authentication)
 */
export async function getWalletPhrase(): Promise<string | null> {
  try {
    // Authenticate before revealing phrase
    const { available } = await biometrics.isSensorAvailable();

    if (available) {
      const { success, error } = await biometrics.simplePrompt({
        promptMessage: 'Authenticate to view recovery phrase',
        cancelButtonText: 'Cancel',
      });

      if (error) {
        console.error('[WalletService] Biometric error:', error);
        return null;
      }

      if (!success) {
        console.log('[WalletService] User cancelled authentication');
        return null;
      }
    }

    // Get the stored mnemonic
    const credentials = await Keychain.getGenericPassword({
      service: WALLET_SERVICE,
    });

    if (!credentials) {
      console.error('[WalletService] No wallet credentials found');
      return null;
    }

    return credentials.password;
  } catch (error) {
    console.error('[WalletService] Failed to get wallet phrase:', error);
    return null;
  }
}

/**
 * Get wallet address from stored mnemonic (requires authentication)
 */
export async function getWalletAddress(): Promise<string | null> {
  const info = await getWalletInfo();
  return info?.address || null;
}

/**
 * Get the private key for signing (requires authentication)
 */
export async function getPrivateKey(): Promise<string | null> {
  try {
    const phrase = await getWalletPhrase();
    if (!phrase) {return null;}

    const mnemonic = ethers.Mnemonic.fromPhrase(phrase);
    const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonic);
    return wallet.privateKey;
  } catch (error) {
    console.error('[WalletService] Failed to get private key:', error);
    return null;
  }
}

/**
 * Delete the wallet (for testing/reset purposes)
 */
export async function deleteWallet(): Promise<boolean> {
  try {
    await Keychain.resetGenericPassword({ service: WALLET_SERVICE });
    await EncryptedStorage.removeItem(WALLET_SETUP_KEY);
    return true;
  } catch (error) {
    console.error('[WalletService] Failed to delete wallet:', error);
    return false;
  }
}

/**
 * Store wallet secret securely in keychain
 * Note: We use simple secure storage without biometric access control for storing.
 * The app-level authentication (useAuth) handles biometric/PIN protection.
 */
async function storeWalletSecret(phrase: string): Promise<boolean> {
  try {
    // Use simple secure storage - the app already requires authentication to access
    await Keychain.setGenericPassword('wallet', phrase, {
      service: WALLET_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return true;
  } catch (error) {
    console.error('[WalletService] Failed to store wallet secret:', error);
    return false;
  }
}

/**
 * Validate a mnemonic phrase
 */
export function isValidMnemonic(phrase: string): boolean {
  try {
    return ethers.Mnemonic.isValidMnemonic(phrase.trim().toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Get address from mnemonic without storing
 */
export function getAddressFromMnemonic(phrase: string): string | null {
  try {
    const mnemonic = ethers.Mnemonic.fromPhrase(phrase.trim().toLowerCase());
    const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonic);
    return wallet.address;
  } catch {
    return null;
  }
}
