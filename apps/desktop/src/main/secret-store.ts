import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface EncryptionBackend {
  isAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface SecretStore {
  save(password: string): Promise<void>;
  load(): Promise<string | undefined>;
  clear(): Promise<void>;
}

interface StoredSecret {
  v: 1;
  encrypted: boolean;
  data: string;
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

function isEperm(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'EPERM'
  );
}

function parseStoredSecret(raw: string): StoredSecret | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  if (record['v'] !== 1 || typeof record['data'] !== 'string') {
    return undefined;
  }
  const data = record['data'];
  if (data.length % 4 !== 0 || !BASE64_PATTERN.test(data)) {
    return undefined;
  }
  return { v: 1, encrypted: record['encrypted'] === true, data };
}

const SecretStore = class SecretStoreImpl implements SecretStore {
  constructor(
    private readonly filePath: string,
    private readonly backend: EncryptionBackend,
  ) {}

  async save(password: string): Promise<void> {
    if (!this.backend.isAvailable()) {
      console.warn(
        '[SecretStore] encryption backend unavailable; storing credentials with encrypted=false marker',
      );
    }
    const payload: StoredSecret = {
      v: 1,
      encrypted: this.backend.isAvailable(),
      data: this.backend.encryptString(password).toString('base64'),
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(payload), {
      encoding: 'utf8',
      mode: 0o600,
    });
    if (process.platform !== 'win32') {
      try {
        await chmod(this.filePath, 0o600);
      } catch (error) {
        if (!isEperm(error)) {
          throw error;
        }
      }
    }
  }

  async load(): Promise<string | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch {
      return undefined;
    }
    const stored = parseStoredSecret(raw);
    if (!stored) {
      return undefined;
    }
    try {
      return this.backend.decryptString(Buffer.from(stored.data, 'base64'));
    } catch {
      return undefined;
    }
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
};

export { SecretStore };
