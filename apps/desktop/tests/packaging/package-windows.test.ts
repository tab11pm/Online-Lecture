import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createPackage } from '@electron/asar';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  parsePackagingTarget,
  runWindowsPackaging,
  type RunCommand,
} from '../../scripts/package-windows.js';
import { REQUIRED_ASAR_ENTRIES } from '../../scripts/packaged-app-check.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'online-lecture-pack-win-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function pe(machine = 0x8664): Buffer {
  const buffer = Buffer.alloc(0x100);
  buffer.write('MZ', 0, 'latin1');
  buffer.writeUInt32LE(0x40, 0x3c);
  buffer.write('PE\0\0', 0x40, 'latin1');
  buffer.writeUInt16LE(machine, 0x44);
  return buffer;
}

interface Fixture {
  desktopDir: string;
  winUnpacked: string;
  installerPath: string;
  nativeSha: string;
  version: string;
}

async function createFixture(): Promise<Fixture> {
  const base = join(root, 'Студент Имя', 'Online Lecture');
  const desktopDir = join(base, 'apps', 'desktop');
  const repoRoot = join(base, 'repo');
  const version = '0.1.0';
  mkdirSync(desktopDir, { recursive: true });
  mkdirSync(repoRoot, { recursive: true });
  writeFileSync(
    join(desktopDir, 'package.json'),
    JSON.stringify({ name: 'desktop', version }),
    'utf8',
  );
  const nativeBytes = pe();
  mkdirSync(join(desktopDir, 'native'), { recursive: true });
  writeFileSync(join(desktopDir, 'native', 'better_sqlite3.node'), nativeBytes);
  writeFileSync(
    join(desktopDir, 'native', 'better_sqlite3.stamp.json'),
    JSON.stringify({
      electron: '44.5.1',
      betterSqlite3: '12.11.1',
      platform: 'win32',
      arch: 'x64',
    }),
    'utf8',
  );

  const winUnpacked = join(desktopDir, 'dist', 'win-unpacked');
  const appDir = join(base, 'asar-app');
  mkdirSync(appDir, { recursive: true });
  for (const entry of REQUIRED_ASAR_ENTRIES) {
    if (entry === 'package.json') continue;
    const path = join(appDir, entry);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '// entry', 'utf8');
  }
  writeFileSync(
    join(appDir, 'package.json'),
    JSON.stringify({ name: 'online-lecture', dependencies: {} }),
    'utf8',
  );
  mkdirSync(
    join(winUnpacked, 'resources', 'app.asar.unpacked', 'node_modules'),
    {
      recursive: true,
    },
  );
  await createPackage(appDir, join(winUnpacked, 'resources', 'app.asar'));
  mkdirSync(join(winUnpacked, 'resources', 'native'), { recursive: true });
  writeFileSync(
    join(winUnpacked, 'resources', 'native', 'better_sqlite3.node'),
    nativeBytes,
  );
  writeFileSync(join(winUnpacked, 'OnlineLecture.exe'), pe());

  const installerPath = join(
    desktopDir,
    'dist',
    `OnlineLecture-Setup-${version}-x64.exe`,
  );

  return {
    desktopDir,
    winUnpacked,
    installerPath,
    nativeSha: createHash('sha256').update(nativeBytes).digest('hex'),
    version,
  };
}

interface Call {
  command: string;
  args: string[];
  cwd: string;
}

function createRun(failOn?: number) {
  const calls: Call[] = [];
  const run: RunCommand = async (command, args, cwd) => {
    calls.push({ command, args: [...args], cwd });
    if (failOn !== undefined && calls.length === failOn) {
      throw new Error('command failed');
    }
  };
  return { run, calls };
}

function deps(run: RunCommand) {
  return {
    platform: 'win32' as const,
    arch: 'x64',
    run,
    nodePath: '/developer/node',
    npmCommand: 'npm',
    builderCliPath: '/builder/cli.js',
    readVersions: () => ({
      electronVersion: '44.5.1',
      sqliteVersion: '12.11.1',
    }),
  };
}

describe('parsePackagingTarget', () => {
  it('accepts exactly --dir or --nsis', () => {
    expect(parsePackagingTarget(['--dir'])).toBe('dir');
    expect(parsePackagingTarget(['--nsis'])).toBe('nsis');
  });

  it('rejects missing, extra or unknown arguments', () => {
    expect(() => parsePackagingTarget([])).toThrow('--dir or --nsis');
    expect(() => parsePackagingTarget(['--dir', '--nsis'])).toThrow(
      '--dir or --nsis',
    );
    expect(() => parsePackagingTarget(['--portable'])).toThrow(
      '--dir or --nsis',
    );
  });
});

describe('runWindowsPackaging', () => {
  it('rejects unsupported platforms before running any command', async () => {
    const fixture = await createFixture();
    const linux = createRun();

    await expect(
      runWindowsPackaging(
        { target: 'dir', desktopDir: fixture.desktopDir },
        { ...deps(linux.run), platform: 'linux' },
      ),
    ).rejects.toThrow('win32 x64');
    expect(linux.calls).toHaveLength(0);

    const arm = createRun();
    await expect(
      runWindowsPackaging(
        { target: 'dir', desktopDir: fixture.desktopDir },
        { ...deps(arm.run), arch: 'arm64' },
      ),
    ).rejects.toThrow('win32 x64');
    expect(arm.calls).toHaveLength(0);
  });

  it('builds and validates an unpacked directory without NSIS', async () => {
    const fixture = await createFixture();
    const runner = createRun();

    await runWindowsPackaging(
      { target: 'dir', desktopDir: fixture.desktopDir },
      deps(runner.run),
    );

    expect(runner.calls).toHaveLength(3);
    expect(runner.calls[0]?.command).toBe('/developer/node');
    expect(runner.calls[0]?.args[0]).toMatch(
      /[\\/]scripts[\\/]check-playwright-versions\.mjs$/,
    );
    expect(runner.calls[1]?.args).toEqual([
      'run',
      'build',
      '-w',
      '@online-lecture/desktop',
    ]);
    expect(runner.calls[2]?.args).toEqual(
      expect.arrayContaining(['--win', '--x64', '--dir', '--publish', 'never']),
    );
    expect(runner.calls[2]?.args).not.toContain('nsis');
    for (const call of runner.calls) {
      expect(isAbsolute(call.cwd)).toBe(true);
    }
  });

  it('creates the NSIS installer from the validated directory and its checksum', async () => {
    const fixture = await createFixture();
    const runner = createRun();
    const installerBytes = Buffer.from('installer');
    writeFileSync(fixture.installerPath, installerBytes);

    await runWindowsPackaging(
      { target: 'nsis', desktopDir: fixture.desktopDir },
      deps(runner.run),
    );

    expect(runner.calls).toHaveLength(4);
    const nsis = runner.calls[3];
    expect(nsis?.args).toEqual(
      expect.arrayContaining([
        '--win',
        'nsis',
        '--x64',
        '--prepackaged',
        fixture.winUnpacked,
        '--publish',
        'never',
      ]),
    );
    const checksum = readFileSync(`${fixture.installerPath}.sha256`, 'utf8');
    expect(checksum).toBe(
      `${createHash('sha256').update(installerBytes).digest('hex')}  OnlineLecture-Setup-0.1.0-x64.exe\n`,
    );
  });

  it('stops the chain when version, build or native checks fail', async () => {
    const fixture = await createFixture();

    const versionFailure = createRun(1);
    await expect(
      runWindowsPackaging(
        { target: 'dir', desktopDir: fixture.desktopDir },
        deps(versionFailure.run),
      ),
    ).rejects.toThrow('command failed');
    expect(versionFailure.calls).toHaveLength(1);

    const buildFailure = createRun(2);
    await expect(
      runWindowsPackaging(
        { target: 'dir', desktopDir: fixture.desktopDir },
        deps(buildFailure.run),
      ),
    ).rejects.toThrow('command failed');
    expect(buildFailure.calls).toHaveLength(2);

    writeFileSync(
      join(fixture.desktopDir, 'native', 'better_sqlite3.node'),
      pe(0xaa64),
    );
    const nativeFailure = createRun();
    await expect(
      runWindowsPackaging(
        { target: 'dir', desktopDir: fixture.desktopDir },
        deps(nativeFailure.run),
      ),
    ).rejects.toThrow('x64');
    expect(nativeFailure.calls).toHaveLength(2);
    expect(nativeFailure.calls[2]).toBeUndefined();
  });

  it('fails when the NSIS artifact is missing or has another name', async () => {
    const fixture = await createFixture();
    const runner = createRun();

    await expect(
      runWindowsPackaging(
        { target: 'nsis', desktopDir: fixture.desktopDir },
        deps(runner.run),
      ),
    ).rejects.toThrow('OnlineLecture-Setup-0.1.0-x64.exe');
  });

  it('resolves a relative desktop directory to absolute command paths', async () => {
    await createFixture();
    const runner = createRun();
    const relativeDesktop = join(
      'Студент Имя',
      'Online Lecture',
      'apps',
      'desktop',
    );
    const previous = process.cwd();
    process.chdir(root);
    try {
      await runWindowsPackaging(
        { target: 'dir', desktopDir: relativeDesktop },
        deps(runner.run),
      );
    } finally {
      process.chdir(previous);
    }

    expect(runner.calls[0]?.cwd).toBe(
      resolve(root, 'Студент Имя', 'Online Lecture'),
    );
    expect(runner.calls[2]?.cwd).toBe(
      resolve(root, 'Студент Имя', 'Online Lecture', 'apps', 'desktop'),
    );
  });

  it('propagates a non-zero builder exit', async () => {
    const fixture = await createFixture();
    const runner = createRun(3);

    await expect(
      runWindowsPackaging(
        { target: 'dir', desktopDir: fixture.desktopDir },
        deps(runner.run),
      ),
    ).rejects.toThrow('command failed');
    expect(existsSync(fixture.installerPath)).toBe(false);
  });
});
