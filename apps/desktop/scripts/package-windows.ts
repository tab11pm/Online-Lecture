import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertWindowsNativeBuild } from './native-build-check.js';
import { verifyPackagedApplication } from './packaged-app-check.js';

export type PackagingTarget = 'dir' | 'nsis';

export type RunCommand = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<void>;

export interface WindowsPackagingDependencies {
  platform: NodeJS.Platform;
  arch: string;
  run: RunCommand;
  nodePath?: string;
  npmCommand?: string;
  builderCliPath?: string;
  readVersions?: () => { electronVersion: string; sqliteVersion: string };
  readVersion?: () => string;
}

export interface WindowsPackagingInput {
  target: PackagingTarget;
  desktopDir: string;
}

interface PackageManifest {
  version?: string;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function defaultRequire(desktopDir: string) {
  return createRequire(join(desktopDir, 'package.json'));
}

function readDesktopVersion(desktopDir: string): string {
  const manifest = JSON.parse(
    readFileSync(join(desktopDir, 'package.json'), 'utf8'),
  ) as PackageManifest;
  if (!manifest.version) {
    throw new Error('desktop package.json has no version');
  }
  return manifest.version;
}

/**
 * Builds the Windows artifact in a fixed order: version check, production and
 * native build, native validation, unpacked package validation, and only then
 * the NSIS installer from the already validated directory.
 */
export async function runWindowsPackaging(
  input: WindowsPackagingInput,
  deps: WindowsPackagingDependencies,
): Promise<void> {
  if (deps.platform !== 'win32' || deps.arch !== 'x64') {
    throw new Error('Windows packaging is supported only on win32 x64');
  }

  const desktopDir = resolve(input.desktopDir);
  const repoRoot = resolve(desktopDir, '..', '..');
  const outputDir = join(desktopDir, 'dist');
  const winUnpacked = join(outputDir, 'win-unpacked');
  const nodePath = deps.nodePath ?? process.execPath;
  const npmInvocation = (() => {
    if (deps.npmCommand) {
      return { command: deps.npmCommand, prefix: [] as string[] };
    }
    const npmCli = process.env.npm_execpath;
    if (npmCli && /npm-cli\.js$/.test(npmCli)) {
      return { command: nodePath, prefix: [npmCli] };
    }
    return {
      command: deps.platform === 'win32' ? 'npm.cmd' : 'npm',
      prefix: [] as string[],
    };
  })();
  const requireFromDesktop = defaultRequire(desktopDir);
  const builderCliPath =
    deps.builderCliPath ??
    requireFromDesktop.resolve('electron-builder/cli.js');
  const versions =
    deps.readVersions?.() ??
    (() => ({
      electronVersion: (
        requireFromDesktop('electron/package.json') as { version: string }
      ).version,
      sqliteVersion: (
        requireFromDesktop('better-sqlite3/package.json') as { version: string }
      ).version,
    }))();
  const version = deps.readVersion?.() ?? readDesktopVersion(desktopDir);

  await deps.run(
    nodePath,
    [join(repoRoot, 'scripts', 'check-playwright-versions.mjs')],
    repoRoot,
  );
  await deps.run(
    npmInvocation.command,
    [...npmInvocation.prefix, 'run', 'build', '-w', '@online-lecture/desktop'],
    repoRoot,
  );

  const nativePath = join(desktopDir, 'native', 'better_sqlite3.node');
  await assertWindowsNativeBuild({
    binaryPath: nativePath,
    stampPath: join(desktopDir, 'native', 'better_sqlite3.stamp.json'),
    electronVersion: versions.electronVersion,
    sqliteVersion: versions.sqliteVersion,
    platform: deps.platform,
    arch: deps.arch,
  });
  const expectedNativeSha256 = sha256(nativePath);

  const configPath = join(desktopDir, 'electron-builder.yml');
  await deps.run(
    nodePath,
    [
      builderCliPath,
      '--win',
      '--x64',
      '--dir',
      '--publish',
      'never',
      '--config',
      configPath,
    ],
    desktopDir,
  );
  await verifyPackagedApplication({
    packageDir: winUnpacked,
    expectedNativeSha256,
  });

  if (input.target === 'dir') {
    return;
  }

  await deps.run(
    nodePath,
    [
      builderCliPath,
      '--win',
      'nsis',
      '--x64',
      '--prepackaged',
      winUnpacked,
      '--publish',
      'never',
      '--config',
      configPath,
    ],
    desktopDir,
  );

  const installerPath = join(
    outputDir,
    `OnlineLecture-Setup-${version}-${deps.arch}.exe`,
  );
  if (!existsSync(installerPath)) {
    throw new Error(
      `NSIS installer was not created: ${basename(installerPath)}`,
    );
  }
  writeFileSync(
    `${installerPath}.sha256`,
    `${sha256(installerPath)}  ${basename(installerPath)}\n`,
    'utf8',
  );
}

export function parsePackagingTarget(args: readonly string[]): PackagingTarget {
  if (args.length !== 1) {
    throw new Error('expected exactly one of --dir or --nsis');
  }
  if (args[0] === '--dir') {
    return 'dir';
  }
  if (args[0] === '--nsis') {
    return 'nsis';
  }
  throw new Error('expected exactly one of --dir or --nsis');
}

async function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
      }
    });
  });
}

async function main(): Promise<void> {
  const target = parsePackagingTarget(process.argv.slice(2));
  const desktopDir = dirname(dirname(fileURLToPath(import.meta.url)));
  await runWindowsPackaging(
    { target, desktopDir },
    { platform: process.platform, arch: process.arch, run: runCommand },
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Windows packaging failed',
    );
    process.exitCode = 1;
  });
}
