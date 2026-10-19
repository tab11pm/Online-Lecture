import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { extractFile, listPackage } from '@electron/asar';
import { assertPeX64 } from './native-build-check.js';

export interface VerifyPackagedApplicationInput {
  packageDir: string;
  expectedNativeSha256: string;
}

export interface VerifyPackagedApplicationResult {
  checkedFiles: number;
}

export const REQUIRED_ASAR_ENTRIES = [
  'package.json',
  'out/main/index.js',
  'out/main/entry.js',
  'out/preload/index.mjs',
  'out/renderer/index.html',
] as const;

const UNPACKED_ROOT = join('resources', 'app.asar.unpacked');
const UNPACKED_MODULES = join(UNPACKED_ROOT, 'node_modules');
const NATIVE_RELATIVE = join('resources', 'native', 'better_sqlite3.node');
const EXECUTABLE_NAME = 'OnlineLecture.exe';

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

function toSafeRelative(packageDir: string, path: string): string {
  return normalizePath(relative(packageDir, path)) || '.';
}

function assertInsidePackage(packageDir: string, path: string): void {
  const rel = relative(packageDir, path);
  if (rel.startsWith('..') || rel === '..' || resolve(rel) === rel) {
    throw new Error(`path escapes the package: ${normalizePath(rel)}`);
  }
}

function forbiddenReason(name: string): string | undefined {
  const base = basename(name).toLowerCase();
  if (base === '.env' || base.startsWith('.env.')) {
    return 'environment file';
  }
  if (base === 'auth.json') {
    return 'authentication state';
  }
  if (/\.(db|sqlite|sqlite3)$/.test(base)) {
    return 'user database';
  }
  if (/\.(log|zip|7z|tgz|tar|gz)$/.test(base)) {
    return 'log or diagnostic archive';
  }
  if (/^(chrome|chromium|edge)-(profile|user-data)/.test(base)) {
    return 'browser profile';
  }
  return undefined;
}

function assertNoForbiddenPath(packageDir: string, path: string): void {
  const reason = forbiddenReason(path);
  if (reason) {
    throw new Error(
      `forbidden ${reason} in package: ${toSafeRelative(packageDir, path)}`,
    );
  }
}

function walkFiles(
  packageDir: string,
  dir: string,
  onFile: (path: string) => void,
): number {
  if (!existsSync(dir)) {
    return 0;
  }
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `symlinks are not allowed in the package: ${toSafeRelative(packageDir, path)}`,
      );
    }
    assertInsidePackage(packageDir, path);
    if (entry.isDirectory()) {
      count += walkFiles(packageDir, path, onFile);
    } else if (entry.isFile()) {
      assertNoForbiddenPath(packageDir, path);
      onFile(path);
      count += 1;
    }
  }
  return count;
}

interface PackageManifest {
  dependencies?: Record<string, string>;
}

function readManifest(path: string, label: string): PackageManifest {
  if (!existsSync(path)) {
    throw new Error(`missing package manifest: ${label}`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
  } catch {
    throw new Error(`invalid package manifest: ${label}`);
  }
}

function resolveModuleDir(fromDir: string, name: string): string | undefined {
  const segments = name.split('/');
  let current = fromDir;
  for (;;) {
    const candidate = join(current, 'node_modules', ...segments);
    if (existsSync(join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function verifyProductionGraph(
  packageDir: string,
  unpackedRoot: string,
  rootManifest: PackageManifest,
): number {
  const visited = new Set<string>();
  let checked = 0;

  const visit = (
    fromDir: string,
    dependencies: Record<string, string> | undefined,
    parentLabel: string,
  ): void => {
    for (const name of Object.keys(dependencies ?? {}).sort()) {
      const moduleDir = resolveModuleDir(fromDir, name);
      const relativeName = normalizePath(
        moduleDir
          ? relative(packageDir, moduleDir)
          : join(relative(packageDir, fromDir), 'node_modules', name),
      );
      if (!moduleDir) {
        throw new Error(
          `missing production dependency ${name} required by ${parentLabel} (${relativeName})`,
        );
      }
      assertInsidePackage(packageDir, moduleDir);
      let real: string;
      try {
        real = realpathSync(moduleDir);
      } catch {
        throw new Error(`unreadable production dependency: ${relativeName}`);
      }
      assertInsidePackage(packageDir, real);
      if (visited.has(real)) {
        continue;
      }
      visited.add(real);
      const manifest = readManifest(
        join(moduleDir, 'package.json'),
        relativeName,
      );
      checked += 1;
      visit(moduleDir, manifest.dependencies, relativeName);
    }
  };

  visit(unpackedRoot, rootManifest.dependencies, 'the application');

  const sqliteBuild = join(
    packageDir,
    UNPACKED_MODULES,
    'better-sqlite3',
    'build',
  );
  if (existsSync(sqliteBuild)) {
    throw new Error(
      'bundled better-sqlite3 build output must not be shipped; use resources/native',
    );
  }

  return checked;
}

/**
 * Verifies the actual packaged directory: ASAR entries, the unpacked
 * production dependency graph, forbidden user data and the native SQLite
 * binary. Only safe relative paths are reported, never file contents.
 */
export async function verifyPackagedApplication(
  input: VerifyPackagedApplicationInput,
): Promise<VerifyPackagedApplicationResult> {
  const packageDir = resolve(input.packageDir);
  if (!existsSync(packageDir)) {
    throw new Error('packaged application directory is missing');
  }
  const realPackageDir = realpathSync(packageDir);

  const executable = join(packageDir, EXECUTABLE_NAME);
  if (!existsSync(executable)) {
    throw new Error(`missing executable: ${EXECUTABLE_NAME}`);
  }
  assertPeX64(readFileSync(executable), EXECUTABLE_NAME);
  let checkedFiles = 1;

  const asarPath = join(packageDir, 'resources', 'app.asar');
  if (!existsSync(asarPath)) {
    throw new Error('missing resources/app.asar');
  }

  let entries: string[];
  try {
    entries = listPackage(asarPath, { isPack: false }).map(normalizePath);
  } catch {
    throw new Error('resources/app.asar cannot be read');
  }
  const entrySet = new Set(entries);
  for (const required of REQUIRED_ASAR_ENTRIES) {
    if (!entrySet.has(required)) {
      throw new Error(`missing ASAR entry: ${required}`);
    }
  }
  for (const entry of entries) {
    if (entry.split('/').includes('..')) {
      throw new Error(`unsafe ASAR entry: ${entry}`);
    }
    assertNoForbiddenPath(packageDir, entry);
    checkedFiles += 1;
  }

  let rootManifest: PackageManifest;
  try {
    rootManifest = JSON.parse(
      extractFile(asarPath, 'package.json').toString('utf8'),
    ) as PackageManifest;
  } catch {
    throw new Error('invalid ASAR package.json');
  }

  const unpackedRoot = join(packageDir, UNPACKED_ROOT);
  if (!existsSync(unpackedRoot)) {
    throw new Error('missing resources/app.asar.unpacked');
  }

  checkedFiles += walkFiles(realPackageDir, realPackageDir, () => undefined);
  checkedFiles += verifyProductionGraph(
    realPackageDir,
    join(realPackageDir, UNPACKED_ROOT),
    rootManifest,
  );

  const nativePath = join(packageDir, NATIVE_RELATIVE);
  if (!existsSync(nativePath)) {
    throw new Error(`missing native module: ${normalizePath(NATIVE_RELATIVE)}`);
  }
  const nativeBytes = readFileSync(nativePath);
  assertPeX64(nativeBytes, normalizePath(NATIVE_RELATIVE));
  const digest = createHash('sha256').update(nativeBytes).digest('hex');
  if (digest !== input.expectedNativeSha256.toLowerCase()) {
    throw new Error(
      'native module checksum does not match the validated build',
    );
  }
  checkedFiles += 1;

  return { checkedFiles };
}
