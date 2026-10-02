import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SecretStore,
  type EncryptionBackend,
} from '../../src/main/secret-store.js';

const base64Backend: EncryptionBackend = {
  isAvailable: () => true,
  encryptString: (s) => Buffer.from(s, 'utf8'),
  decryptString: (b) => b.toString('utf8'),
};
const unavailable: EncryptionBackend = {
  isAvailable: () => false,
  encryptString: (s) => Buffer.from(s, 'utf8'),
  decryptString: (b) => b.toString('utf8'),
};

describe('SecretStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'secret-'));
  });

  it('round-trips a password and never stores it in plaintext', async () => {
    const store = new SecretStore(join(dir, 'credentials.enc'), base64Backend);
    await store.save('s3cret');
    expect(await store.load()).toBe('s3cret');
    expect(
      (await readFile(join(dir, 'credentials.enc'))).toString('utf8'),
    ).not.toContain('s3cret');
  });

  it('returns undefined when the file is missing', async () => {
    const store = new SecretStore(join(dir, 'absent.enc'), base64Backend);
    expect(await store.load()).toBeUndefined();
  });

  it('treats corrupted content as absent instead of throwing', async () => {
    const file = join(dir, 'bad.enc');
    await writeFile(file, 'not-json');
    const store = new SecretStore(file, base64Backend);
    expect(await store.load()).toBeUndefined();
  });

  it('marks the payload when encryption is unavailable', async () => {
    const file = join(dir, 'plain.enc');
    const store = new SecretStore(file, unavailable);
    await store.save('s3cret');
    const written = JSON.parse((await readFile(file)).toString('utf8'));
    expect(written.encrypted).toBe(false);
    expect(await store.load()).toBe('s3cret');
  });
});
