/**
 * Global Jest setup for React Native tests.
 */
import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-encrypted-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(() => Promise.resolve()),
    getItem: jest.fn(() => Promise.resolve(undefined)),
    removeItem: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0 },
  setGenericPassword: jest.fn(() => Promise.resolve()),
  getGenericPassword: jest.fn(() => Promise.resolve(false)),
  resetGenericPassword: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-biometrics', () => ({
  __esModule: true,
  default: class ReactNativeBiometrics {
    isSensorAvailable() {
      return Promise.resolve({ available: true, biometryType: 'FaceID' });
    }
    simplePrompt() {
      return Promise.resolve({ success: true });
    }
    createKeys() {
      return Promise.resolve({ publicKey: 'mock' });
    }
    createSignature() {
      return Promise.resolve({ success: true, signature: 'mock' });
    }
  },
}));

jest.mock('@react-native-clipboard/clipboard', () => ({
  __esModule: true,
  default: {
    setString: jest.fn(() => Promise.resolve()),
    getString: jest.fn(() => Promise.resolve('')),
    hasString: jest.fn(() => Promise.resolve(false)),
  },
}));

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/tmp',
    CachesDirectoryPath: '/tmp',
    readDir: jest.fn(() => Promise.resolve([])),
    readFile: jest.fn(() => Promise.resolve('')),
    writeFile: jest.fn(() => Promise.resolve()),
    unlink: jest.fn(() => Promise.resolve()),
    exists: jest.fn(() => Promise.resolve(false)),
    mkdir: jest.fn(() => Promise.resolve()),
  },
}));
