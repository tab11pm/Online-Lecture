import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertPeX64,
  assertWindowsNativeBuild,
  readPeMachine,
} from '../../scripts/native-build-check.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'online-lecture-native-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function pe(machine = 0x8664, size = 0x100): Buffer {
  const buffer = Buffer.alloc(size);
  buffer.write('MZ', 0, 'latin1');
  buffer.writeUInt32LE(0x40, 0x3c);
  buffer.write('PE\0\0', 0x40, 'latin1');
  buffer.writeUInt16LE(machine, 0x44);
  return buffer;
}

function writeBinary(bytes: Buffer): string {
  const path = join(root, 'better_sqlite3.node');
  writeFileSync(path, bytes);
  return path;
}

function writeStamp(overrides: Record<string, unknown> = {}): string {
  const path = join(root, 'better_sqlite3.stamp.json');
  writeFileSync(
    path,
    JSON.stringify({
      electron: '44.5.1',
      betterSqlite3: '12.11.1',
      platform: 'win32',
      arch: 'x64',
      ...overrides,
    }),
    'utf8',
  );
  return path;
}

function validInput(binaryPath: string, stampPath: string) {
  return {
    binaryPath,
    stampPath,
    electronVersion: '44.5.1',
    sqliteVersion: '12.11.1',
    platform: 'win32' as const,
    arch: 'x64',
  };
}

describe('readPeMachine', () => {
  it('reads the x64 machine type', () => {
    expect(readPeMachine(pe())).toBe(0x8664);
  });

  it('rejects ELF and truncated PE headers', () => {
    expect(() =>
      readPeMachine(Buffer.from('\x7fELF\x02\x01\x01', 'latin1')),
    ).toThrow('DOS signature');
    const truncated = pe();
    truncated.writeUInt32LE(0x1000, 0x3c);
    expect(() => readPeMachine(truncated)).toThrow('out of bounds');
  });
});

describe('assertPeX64', () => {
  it('rejects arm64 and ia32 images', () => {
    expect(() => assertPeX64(pe(0xaa64), 'native')).toThrow('expected x64');
    expect(() => assertPeX64(pe(0x14c), 'native')).toThrow('expected x64');
  });
});

describe('assertWindowsNativeBuild', () => {
  it('accepts a current Windows x64 build', async () => {
    const binaryPath = writeBinary(pe());
    const stampPath = writeStamp();

    await expect(
      assertWindowsNativeBuild(validInput(binaryPath, stampPath)),
    ).resolves.toBeUndefined();
  });

  it('rejects a non-Windows host or architecture before reading files', async () => {
    const binaryPath = writeBinary(pe());
    const stampPath = writeStamp();

    await expect(
      assertWindowsNativeBuild({
        ...validInput(binaryPath, stampPath),
        platform: 'linux',
      }),
    ).rejects.toThrow('win32 x64');
    await expect(
      assertWindowsNativeBuild({
        ...validInput(binaryPath, stampPath),
        arch: 'arm64',
      }),
    ).rejects.toThrow('win32 x64');
  });

  it('rejects an ELF binary, wrong machine or truncated header', async () => {
    const stampPath = writeStamp();

    const elf = join(root, 'elf.node');
    writeFileSync(elf, Buffer.from('\x7fELF\x02\x01\x01', 'latin1'));
    await expect(
      assertWindowsNativeBuild(validInput(elf, stampPath)),
    ).rejects.toThrow('DOS signature');

    const arm = writeBinary(pe(0xaa64));
    await expect(
      assertWindowsNativeBuild(validInput(arm, stampPath)),
    ).rejects.toThrow('x64');

    const truncated = pe();
    truncated.writeUInt32LE(0x5000, 0x3c);
    const broken = writeBinary(truncated);
    await expect(
      assertWindowsNativeBuild(validInput(broken, stampPath)),
    ).rejects.toThrow('out of bounds');
  });

  it('rejects missing binary or stamp', async () => {
    const binaryPath = writeBinary(pe());
    const stampPath = writeStamp();

    await expect(
      assertWindowsNativeBuild(
        validInput(join(root, 'missing.node'), stampPath),
      ),
    ).rejects.toThrow('missing');
    await expect(
      assertWindowsNativeBuild(
        validInput(binaryPath, join(root, 'missing.json')),
      ),
    ).rejects.toThrow('missing');
  });

  it('rejects stale electron, sqlite or platform stamps', async () => {
    const binaryPath = writeBinary(pe());

    await expect(
      assertWindowsNativeBuild(
        validInput(binaryPath, writeStamp({ electron: '43.0.0' })),
      ),
    ).rejects.toThrow('Electron');
    await expect(
      assertWindowsNativeBuild(
        validInput(binaryPath, writeStamp({ betterSqlite3: '12.0.0' })),
      ),
    ).rejects.toThrow('better-sqlite3');
    await expect(
      assertWindowsNativeBuild(
        validInput(binaryPath, writeStamp({ arch: 'arm64' })),
      ),
    ).rejects.toThrow('target platform');
  });
});
