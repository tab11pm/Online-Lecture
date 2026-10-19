import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createPackage } from '@electron/asar';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  REQUIRED_ASAR_ENTRIES,
  verifyPackagedApplication,
} from '../../scripts/packaged-app-check.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'online-lecture-packaged-'));
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

interface ModuleSpec {
  name: string;
  dependencies?: Record<string, string>;
}

interface Fixture {
  packageDir: string;
  nativeSha: string;
  modulesDir: string;
  nativePath: string;
  asarPath: string;
}

const DEFAULT_MODULES: ModuleSpec[] = [
  { name: 'better-sqlite3', dependencies: { bindings: '^1.5.0' } },
  { name: 'bindings' },
  { name: 'jsdom' },
  { name: 'playwright', dependencies: { 'playwright-core': '^1.52.0' } },
  { name: 'playwright-core' },
  { name: 'sdo_mcp', dependencies: { dotenv: '^17.4.2' } },
  { name: 'sdo_mcp/node_modules/dotenv' },
];

function writeModule(
  modulesDir: string,
  spec: ModuleSpec,
  extra: Record<string, string> = {},
): void {
  const dir = join(modulesDir, ...spec.name.split('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: spec.name.split('/').pop(),
      version: '1.0.0',
      ...(spec.dependencies ? { dependencies: spec.dependencies } : {}),
    }),
    'utf8',
  );
  for (const [name, contents] of Object.entries(extra)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
  }
}

async function buildFixture(
  options: {
    modules?: ModuleSpec[];
    extraUnpacked?: Record<string, string>;
  } = {},
): Promise<Fixture> {
  const base = join(root, 'Студент Имя', 'OnlineLecture');
  const packageDir = join(base, 'win-unpacked');
  const appDir = join(base, 'app');
  const modulesDir = join(
    packageDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
  );
  mkdirSync(appDir, { recursive: true });
  for (const entry of REQUIRED_ASAR_ENTRIES) {
    if (entry === 'package.json') continue;
    const path = join(appDir, entry);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `// ${entry}`, 'utf8');
  }
  const dependencies: Record<string, string> = {};
  for (const spec of options.modules ?? DEFAULT_MODULES) {
    if (!spec.name.includes('/')) dependencies[spec.name] = '^1.0.0';
  }
  writeFileSync(
    join(appDir, 'package.json'),
    JSON.stringify({ name: 'online-lecture', dependencies }),
    'utf8',
  );

  mkdirSync(join(packageDir, 'resources'), { recursive: true });
  mkdirSync(modulesDir, { recursive: true });
  const asarPath = join(packageDir, 'resources', 'app.asar');
  await createPackage(appDir, asarPath);
  rmSync(appDir, { recursive: true, force: true });

  for (const spec of options.modules ?? DEFAULT_MODULES) {
    writeModule(modulesDir, spec);
  }
  for (const file of [
    ['better-sqlite3', 'lib', 'index.js'],
    ['playwright', 'cli.js'],
    ['sdo_mcp', 'dist', 'index.js'],
  ]) {
    const path = join(modulesDir, ...file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'process.exit(0);', 'utf8');
  }
  writeFileSync(
    join(modulesDir, 'better-sqlite3', 'package.json'),
    JSON.stringify({
      name: 'better-sqlite3',
      version: '1.0.0',
      main: 'lib/index.js',
    }),
    'utf8',
  );
  writeFileSync(
    join(modulesDir, 'playwright', 'package.json'),
    JSON.stringify({
      name: 'playwright',
      version: '1.0.0',
      bin: { playwright: 'cli.js' },
    }),
    'utf8',
  );
  writeFileSync(
    join(modulesDir, 'sdo_mcp', 'package.json'),
    JSON.stringify({
      name: 'sdo_mcp',
      version: '1.0.0',
      main: 'dist/index.js',
      dependencies: { dotenv: '^17.4.2' },
    }),
    'utf8',
  );
  for (const [name, contents] of Object.entries(options.extraUnpacked ?? {})) {
    const path = join(packageDir, 'resources', 'app.asar.unpacked', name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
  }

  const nativePath = join(
    packageDir,
    'resources',
    'native',
    'better_sqlite3.node',
  );
  mkdirSync(dirname(nativePath), { recursive: true });
  const nativeBytes = pe();
  writeFileSync(nativePath, nativeBytes);
  writeFileSync(join(packageDir, 'OnlineLecture.exe'), pe());

  return {
    packageDir,
    nativeSha: createHash('sha256').update(nativeBytes).digest('hex'),
    modulesDir,
    nativePath,
    asarPath,
  };
}

describe('verifyPackagedApplication', () => {
  it('accepts a complete package in a path with Cyrillic and spaces', async () => {
    const fixture = await buildFixture();

    const result = await verifyPackagedApplication({
      packageDir: fixture.packageDir,
      expectedNativeSha256: fixture.nativeSha.toUpperCase(),
    });

    expect(result.checkedFiles).toBeGreaterThan(REQUIRED_ASAR_ENTRIES.length);
  });

  it('does not treat a parent directory named profiles as packaged profile data', async () => {
    const fixture = await buildFixture();
    const movedPackageDir = join(root, 'profiles', 'clean-package');
    mkdirSync(dirname(movedPackageDir), { recursive: true });
    renameSync(fixture.packageDir, movedPackageDir);
    fixture.packageDir = movedPackageDir;

    await expect(
      verifyPackagedApplication({
        packageDir: fixture.packageDir,
        expectedNativeSha256: fixture.nativeSha,
      }),
    ).resolves.toBeDefined();
  });

  it('rejects a missing worker entry', async () => {
    const fixture = await buildFixture();
    const appDir = join(root, 'rebuild');
    mkdirSync(appDir, { recursive: true });
    for (const entry of REQUIRED_ASAR_ENTRIES) {
      if (entry === 'package.json' || entry === 'out/main/entry.js') continue;
      const path = join(appDir, entry);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `// ${entry}`);
    }
    writeFileSync(
      join(appDir, 'package.json'),
      JSON.stringify({
        dependencies: {
          sdo_mcp: '^1.0.0',
          'better-sqlite3': '^1.0.0',
          jsdom: '^1.0.0',
          playwright: '^1.0.0',
        },
      }),
    );
    await createPackage(appDir, fixture.asarPath);

    await expect(
      verifyPackagedApplication({
        packageDir: fixture.packageDir,
        expectedNativeSha256: fixture.nativeSha,
      }),
    ).rejects.toThrow('out/main/entry.js');
  });

  it('rejects a missing nested production dependency', async () => {
    const fixture = await buildFixture({
      modules: DEFAULT_MODULES.filter(
        (spec) => spec.name !== 'sdo_mcp/node_modules/dotenv',
      ),
    });

    await expect(
      verifyPackagedApplication({
        packageDir: fixture.packageDir,
        expectedNativeSha256: fixture.nativeSha,
      }),
    ).rejects.toThrow('dotenv');
  });

  it.each([
    ['sdo_mcp', 'dist/index.js', 'SDO MCP'],
    ['playwright', 'cli.js', 'Playwright CLI'],
    ['better-sqlite3', 'lib/index.js', 'better-sqlite3 entry'],
  ])(
    'rejects a missing critical runtime file: %s/%s',
    async (moduleName, file, label) => {
      const fixture = await buildFixture();
      rmSync(join(fixture.modulesDir, moduleName, file), { force: true });

      await expect(
        verifyPackagedApplication({
          packageDir: fixture.packageDir,
          expectedNativeSha256: fixture.nativeSha,
        }),
      ).rejects.toThrow(label);
    },
  );

  it('rejects critical manifest paths that escape the package', async () => {
    const fixture = await buildFixture();
    writeFileSync(
      join(fixture.modulesDir, 'sdo_mcp', 'package.json'),
      JSON.stringify({ name: 'sdo_mcp', main: '../../../../../outside.js' }),
      'utf8',
    );

    await expect(
      verifyPackagedApplication({
        packageDir: fixture.packageDir,
        expectedNativeSha256: fixture.nativeSha,
      }),
    ).rejects.toThrow('escapes the package');
  });

  it('rejects a native checksum mismatch and a non-x64 binary', async () => {
    const fixture = await buildFixture();

    await expect(
      verifyPackagedApplication({
        packageDir: fixture.packageDir,
        expectedNativeSha256: '0'.repeat(64),
      }),
    ).rejects.toThrow('checksum');

    writeFileSync(fixture.nativePath, pe(0xaa64));
    await expect(
      verifyPackagedApplication({
        packageDir: fixture.packageDir,
        expectedNativeSha256: fixture.nativeSha,
      }),
    ).rejects.toThrow('x64');
  });

  it('rejects bundled better-sqlite3 build output', async () => {
    const fixture = await buildFixture();
    const buildDir = join(fixture.modulesDir, 'better-sqlite3', 'build');
    mkdirSync(buildDir, { recursive: true });
    writeFileSync(join(buildDir, 'better_sqlite3.node'), pe());

    await expect(
      verifyPackagedApplication({
        packageDir: fixture.packageDir,
        expectedNativeSha256: fixture.nativeSha,
      }),
    ).rejects.toThrow('resources/native');
  });

  it.each([
    ['.env', 'environment file'],
    ['.env.production', 'environment file'],
    ['auth.json', 'authentication state'],
    ['data/lectures.db', 'user database'],
    ['logs/core.log', 'log or diagnostic archive'],
    ['diagnostics/session.zip', 'log or diagnostic archive'],
  ])('rejects forbidden file %s in own resources', async (path, reason) => {
    const fixture = await buildFixture();
    const target = join(
      fixture.packageDir,
      'resources',
      'app.asar.unpacked',
      path,
    );
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'fixture');

    await expect(
      verifyPackagedApplication({
        packageDir: fixture.packageDir,
        expectedNativeSha256: fixture.nativeSha,
      }),
    ).rejects.toThrow(reason);
  });

  it('rejects forbidden files inside the ASAR', async () => {
    const base = join(root, 'asar-forbidden');
    const appDir = join(base, 'app');
    mkdirSync(appDir, { recursive: true });
    for (const entry of REQUIRED_ASAR_ENTRIES) {
      if (entry === 'package.json') continue;
      const path = join(appDir, entry);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, '// entry');
    }
    writeFileSync(join(appDir, '.env'), 'SECRET=1');
    writeFileSync(
      join(appDir, 'package.json'),
      JSON.stringify({ dependencies: {} }),
    );
    const packageDir = join(base, 'win-unpacked');
    mkdirSync(
      join(packageDir, 'resources', 'app.asar.unpacked', 'node_modules'),
      {
        recursive: true,
      },
    );
    writeFileSync(join(packageDir, 'OnlineLecture.exe'), pe());
    const nativePath = join(
      packageDir,
      'resources',
      'native',
      'better_sqlite3.node',
    );
    mkdirSync(dirname(nativePath), { recursive: true });
    writeFileSync(nativePath, pe());
    await createPackage(appDir, join(packageDir, 'resources', 'app.asar'));

    await expect(
      verifyPackagedApplication({
        packageDir,
        expectedNativeSha256: createHash('sha256').update(pe()).digest('hex'),
      }),
    ).rejects.toThrow('environment file');
  });

  it('allows legitimate Undici cookies source inside the ASAR', async () => {
    const fixture = await buildFixture();
    const appDir = join(root, 'asar-undici-cookies');
    mkdirSync(appDir, { recursive: true });
    for (const entry of REQUIRED_ASAR_ENTRIES) {
      if (entry === 'package.json') continue;
      const target = join(appDir, entry);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, '// entry');
    }
    const source = join(
      appDir,
      'node_modules',
      'undici',
      'lib',
      'web',
      'cookies',
      'index.js',
    );
    mkdirSync(dirname(source), { recursive: true });
    writeFileSync(source, 'export {};');
    writeFileSync(
      join(appDir, 'package.json'),
      JSON.stringify({ dependencies: {} }),
    );
    await createPackage(appDir, fixture.asarPath);

    await expect(
      verifyPackagedApplication({
        packageDir: fixture.packageDir,
        expectedNativeSha256: fixture.nativeSha,
      }),
    ).resolves.toBeDefined();
  });

  it('allows legitimate Undici cookies source in unpacked dependencies', async () => {
    const fixture = await buildFixture({
      extraUnpacked: {
        'node_modules/undici/lib/web/cookies/index.js': 'export {};',
      },
    });

    await expect(
      verifyPackagedApplication({
        packageDir: fixture.packageDir,
        expectedNativeSha256: fixture.nativeSha,
      }),
    ).resolves.toBeDefined();
  });

  it.each(['profiles/Default/Cookies', 'profiles/Default/Network/Cookies'])(
    'rejects browser profile data inside ASAR at %s',
    async (path) => {
      const fixture = await buildFixture();
      const appDir = join(root, 'asar-profile');
      mkdirSync(appDir, { recursive: true });
      for (const entry of REQUIRED_ASAR_ENTRIES) {
        if (entry === 'package.json') continue;
        const target = join(appDir, entry);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, '// entry');
      }
      const profileFile = join(appDir, path);
      mkdirSync(dirname(profileFile), { recursive: true });
      writeFileSync(profileFile, 'fixture cookie database');
      writeFileSync(
        join(appDir, 'package.json'),
        JSON.stringify({ dependencies: {} }),
      );
      await createPackage(appDir, fixture.asarPath);

      await expect(
        verifyPackagedApplication({
          packageDir: fixture.packageDir,
          expectedNativeSha256: fixture.nativeSha,
        }),
      ).rejects.toThrow(/browser profile.*resources\/app\.asar\/profiles/);
    },
  );

  it('rejects unpacked profile directories and reports only package-relative paths', async () => {
    const fixture = await buildFixture();
    const cookie = join(
      fixture.packageDir,
      'resources',
      'profiles',
      'Default',
      'Cookies',
    );
    mkdirSync(dirname(cookie), { recursive: true });
    writeFileSync(cookie, 'fixture cookie database');

    await expect(
      verifyPackagedApplication({
        packageDir: fixture.packageDir,
        expectedNativeSha256: fixture.nativeSha,
      }),
    ).rejects.toThrow('resources/profiles');
  });

  it.each(['chromium-profile', 'edge-profile', 'chrome-user-data-123'])(
    'rejects unpacked browser profile directory %s with arbitrary artifacts',
    async (profileDir) => {
      const fixture = await buildFixture();
      const artifact = join(
        fixture.packageDir,
        'resources',
        profileDir,
        'Local Storage',
        'leveldb',
        '000003.ldb',
      );
      mkdirSync(dirname(artifact), { recursive: true });
      writeFileSync(artifact, 'fixture browser profile artifact');

      await expect(
        verifyPackagedApplication({
          packageDir: fixture.packageDir,
          expectedNativeSha256: fixture.nativeSha,
        }),
      ).rejects.toThrow(`resources/${profileDir}`);
    },
  );

  it.each(['chromium-profile', 'edge-profile', 'chrome-user-data-123'])(
    'rejects ASAR browser profile directory %s with arbitrary artifacts',
    async (profileDir) => {
      const fixture = await buildFixture();
      const appDir = join(root, `asar-${profileDir}`);
      mkdirSync(appDir, { recursive: true });
      for (const entry of REQUIRED_ASAR_ENTRIES) {
        if (entry === 'package.json') continue;
        const target = join(appDir, entry);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, '// entry');
      }
      const artifact = join(
        appDir,
        profileDir,
        'Local Storage',
        'leveldb',
        '000003.ldb',
      );
      mkdirSync(dirname(artifact), { recursive: true });
      writeFileSync(artifact, 'fixture browser profile artifact');
      writeFileSync(
        join(appDir, 'package.json'),
        JSON.stringify({ dependencies: {} }),
      );
      await createPackage(appDir, fixture.asarPath);

      await expect(
        verifyPackagedApplication({
          packageDir: fixture.packageDir,
          expectedNativeSha256: fixture.nativeSha,
        }),
      ).rejects.toThrow(new RegExp(`resources/app\\.asar/${profileDir}`));
    },
  );

  it('allows LICENSE, NOTICE and third-party SQL files', async () => {
    const fixture = await buildFixture({
      extraUnpacked: {
        'node_modules/better-sqlite3/LICENSE': 'MIT',
        'node_modules/better-sqlite3/NOTICE': 'notice',
        'node_modules/better-sqlite3/deps/sqlite3/sqlite3.c': '/* sql */',
      },
    });

    await expect(
      verifyPackagedApplication({
        packageDir: fixture.packageDir,
        expectedNativeSha256: fixture.nativeSha,
      }),
    ).resolves.toBeDefined();
  });

  it('rejects symlinks that escape the package', async () => {
    const fixture = await buildFixture();
    const outside = join(root, 'outside');
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'package.json'), '{}');
    const link = join(fixture.modulesDir, 'leaked');
    symlinkSync(outside, link);
    try {
      await expect(
        verifyPackagedApplication({
          packageDir: fixture.packageDir,
          expectedNativeSha256: fixture.nativeSha,
        }),
      ).rejects.toThrow('symlink');
    } finally {
      if (existsSync(link)) unlinkSync(link);
    }
  });

  it('rejects a missing executable or ASAR', async () => {
    const fixture = await buildFixture();
    rmSync(join(fixture.packageDir, 'OnlineLecture.exe'));
    await expect(
      verifyPackagedApplication({
        packageDir: fixture.packageDir,
        expectedNativeSha256: fixture.nativeSha,
      }),
    ).rejects.toThrow('executable');

    const second = await buildFixture();
    rmSync(second.asarPath);
    await expect(
      verifyPackagedApplication({
        packageDir: second.packageDir,
        expectedNativeSha256: second.nativeSha,
      }),
    ).rejects.toThrow('app.asar');
  });
});
