import { safeStorage } from 'electron';
import type { EncryptionBackend } from './secret-store.js';

const WINDOWS_UNAVAILABLE_MESSAGE =
  'Шифрование Windows DPAPI недоступно; пароль не сохранён.';

export function createSafeStorageBackend(): EncryptionBackend {
  return {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (value) => {
      if (!safeStorage.isEncryptionAvailable()) {
        if (process.platform === 'win32') {
          throw new Error(WINDOWS_UNAVAILABLE_MESSAGE);
        }
        return Buffer.from(value, 'utf8');
      }
      return safeStorage.encryptString(value);
    },
    decryptString: (value) => {
      if (
        !safeStorage.isEncryptionAvailable() &&
        process.platform !== 'win32'
      ) {
        return value.toString('utf8');
      }
      return safeStorage.decryptString(value);
    },
  };
}
