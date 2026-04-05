import { useCallback, useEffect, useState } from 'react';
import ReactNativeBiometrics from 'react-native-biometrics';
import { hasStoredIDs } from '../storage/idStorage';

export type AuthStatus = 'checking' | 'unlocked' | 'locked' | 'no_ids';

// Initialize biometrics with device credentials fallback (PIN/password)
const biometrics = new ReactNativeBiometrics({
  allowDeviceCredentials: true,
});

/**
 * Check if biometric authentication is available on the device
 */
async function checkBiometricsAvailable(): Promise<boolean> {
  try {
    const { available } = await biometrics.isSensorAvailable();
    return available;
  } catch (error) {
    console.warn('[checkBiometricsAvailable] Error:', error);
    return false;
  }
}

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);

  useEffect(() => {
    checkInitialState();
  }, []);

  const checkInitialState = async () => {
    try {
      const hasIds = await hasStoredIDs();
      if (!hasIds) {
        setStatus('no_ids');
        return;
      }

      const available = await checkBiometricsAvailable();
      setBiometricsAvailable(available);
      setStatus('locked');
    } catch (error) {
      console.error('[useAuth] Initial check failed:', error);
      setStatus('no_ids');
    }
  };

  const authenticate = useCallback(async (): Promise<boolean> => {
    try {
      const hasIds = await hasStoredIDs();
      if (!hasIds) {
        setStatus('no_ids');
        return true;
      }

      // Check if biometrics/device credentials are available
      const { available } = await biometrics.isSensorAvailable();

      if (!available) {
        // No biometrics and no device credentials available
        // This means device has no security - allow access
        console.warn('[useAuth] No biometrics or device credentials available');
        setStatus('unlocked');
        return true;
      }

      // Prompt for biometrics or device PIN/password
      const { success, error } = await biometrics.simplePrompt({
        promptMessage: 'Unlock Vocdoni Passport',
        cancelButtonText: 'Cancel',
      });

      if (error) {
        console.error('[useAuth] Biometric prompt error:', error);
        // Don't auto-unlock on error, let user retry
        return false;
      }

      if (success) {
        setStatus('unlocked');
        return true;
      }

      // User cancelled or auth failed
      console.log('[useAuth] Authentication not successful');
      return false;
    } catch (error: any) {
      console.error('[useAuth] Authentication error:', error);
      // On unexpected error, don't auto-unlock
      return false;
    }
  }, []);

  const lock = useCallback(() => {
    setStatus('locked');
  }, []);

  const refreshAuthState = useCallback(async () => {
    const hasIds = await hasStoredIDs();
    if (!hasIds) {
      setStatus('no_ids');
    } else if (status === 'no_ids') {
      setStatus('locked');
    }
  }, [status]);

  const setupAuth = useCallback(async () => {
    // No setup needed for react-native-biometrics
  }, []);

  return {
    status,
    biometricsAvailable,
    authenticate,
    lock,
    refreshAuthState,
    setupAuth,
  };
}

/**
 * Authenticates the user before signing a petition.
 * Returns true if authentication succeeded, false otherwise.
 */
export async function authenticateForSigning(): Promise<boolean> {
  try {
    // Check if biometrics/device credentials are available
    const { available } = await biometrics.isSensorAvailable();

    if (!available) {
      // No security available on device - allow signing
      // (user chose to have an unsecured device)
      console.warn('[authenticateForSigning] No biometrics available');
      return true;
    }

    // Prompt for biometrics or device PIN/password
    const { success, error } = await biometrics.simplePrompt({
      promptMessage: 'Confirm signature',
      cancelButtonText: 'Cancel',
    });

    if (error) {
      console.error('[authenticateForSigning] Biometric prompt error:', error);
      return false;
    }

    return success;
  } catch (error: any) {
    console.error('[authenticateForSigning] Error:', error);
    return false;
  }
}
