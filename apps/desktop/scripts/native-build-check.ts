import { existsSync, readFileSync } from 'node:fs';

export interface WindowsNativeBuildInput {
  binaryPath: string;
  stampPath: string;
  electronVersion: string;
  sqliteVersion: string;
  platform: NodeJS.Platform;
  arch: string;
}

interface NativeStamp {
  electron?: unknown;
  betterSqlite3?: unknown;
  platform?: unknown;
  arch?: unknown;
}

const PE_MACHINE_AMD64 = 0x8664;

/**
 * Reads the COFF machine type from a PE image. Throws a descriptive error for
 * anything that is not a structurally complete PE file.
 */
export function readPeMachine(buffer: Buffer): number {
  if (buffer.length < 0x40 || buffer[0] !== 0x4d || buffer[1] !== 0x5a) {
    throw new Error('not a PE image: missing DOS signature');
  }
  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset < 0x40 || peOffset + 24 > buffer.length) {
    throw new Error('not a PE image: PE header is out of bounds');
  }
  if (buffer.toString('latin1', peOffset, peOffset + 4) !== 'PE\0\0') {
    throw new Error('not a PE image: missing PE signature');
  }
  return buffer.readUInt16LE(peOffset + 4);
}

export function assertPeX64(buffer: Buffer, label: string): void {
  let machine: number;
  try {
    machine = readPeMachine(buffer);
  } catch (error) {
    throw new Error(
      `${label}: ${error instanceof Error ? error.message : 'invalid PE image'}`,
    );
  }
  if (machine !== PE_MACHINE_AMD64) {
    throw new Error(
      `${label}: expected x64 PE machine 0x8664, got 0x${machine.toString(16)}`,
    );
  }
}

function readStamp(path: string): NativeStamp {
  if (!existsSync(path)) {
    throw new Error('native build stamp is missing');
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as NativeStamp;
  } catch {
    throw new Error('native build stamp is not valid JSON');
  }
}

/**
 * Validates that a native module can be shipped in a Windows x64 build.
 * Runs before packaging so a Linux or stale binary never reaches an installer.
 */
export async function assertWindowsNativeBuild(
  input: WindowsNativeBuildInput,
): Promise<void> {
  if (input.platform !== 'win32' || input.arch !== 'x64') {
    throw new Error('Windows packaging requires a win32 x64 host build');
  }
  if (!existsSync(input.binaryPath)) {
    throw new Error('native module is missing');
  }
  const stamp = readStamp(input.stampPath);
  if (stamp.electron !== input.electronVersion) {
    throw new Error('native module was built for a different Electron version');
  }
  if (stamp.betterSqlite3 !== input.sqliteVersion) {
    throw new Error(
      'native module was built for a different better-sqlite3 version',
    );
  }
  if (stamp.platform !== input.platform || stamp.arch !== input.arch) {
    throw new Error('native module was built for a different target platform');
  }
  assertPeX64(readFileSync(input.binaryPath), 'native module');
}
