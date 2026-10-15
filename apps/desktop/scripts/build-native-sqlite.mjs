// Builds better-sqlite3 for Electron into apps/desktop/native/ without
// touching the Node build in node_modules (tests and the CLI keep using it).
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const desktopDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const nativeDir = join(desktopDir, 'native');
const output = join(nativeDir, 'better_sqlite3.node');
const stampPath = join(nativeDir, 'better_sqlite3.stamp.json');

const sqliteDir = dirname(require.resolve('better-sqlite3/package.json'));
const sqliteVersion = require('better-sqlite3/package.json').version;
const electronVersion = require('electron/package.json').version;
const stamp = {
  electron: electronVersion,
  betterSqlite3: sqliteVersion,
  platform: process.platform,
  arch: process.arch,
};

function currentStamp() {
  try {
    return JSON.parse(readFileSync(stampPath, 'utf8'));
  } catch {
    return undefined;
  }
}

const previous = currentStamp();
if (
  existsSync(output) &&
  previous &&
  Object.entries(stamp).every(([key, value]) => previous[key] === value)
) {
  console.log(`better-sqlite3 for Electron ${electronVersion} is up to date`);
  process.exit(0);
}

// npm exposes its bundled node-gyp to lifecycle scripts; fall back to a local one.
const nodeGyp =
  process.env.npm_config_node_gyp ??
  require.resolve('node-gyp/bin/node-gyp.js');

const workDir = join(nativeDir, 'build-better-sqlite3');
rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });
for (const entry of ['binding.gyp', 'deps', 'src', 'package.json']) {
  cpSync(join(sqliteDir, entry), join(workDir, entry), { recursive: true });
}

console.log(
  `Building better-sqlite3 ${sqliteVersion} for Electron ${electronVersion} (${process.platform}-${process.arch})…`,
);
const result = spawnSync(
  process.execPath,
  [
    nodeGyp,
    'rebuild',
    `--target=${electronVersion}`,
    `--arch=${process.arch}`,
    '--dist-url=https://electronjs.org/headers',
    '--runtime=electron',
  ],
  { cwd: workDir, stdio: 'inherit' },
);
if (result.status !== 0) {
  console.error(
    'Сборка better-sqlite3 под Electron не удалась. На Windows нужны Visual Studio Build Tools (C++) и Python.',
  );
  process.exit(result.status ?? 1);
}

cpSync(join(workDir, 'build', 'Release', 'better_sqlite3.node'), output);
writeFileSync(stampPath, JSON.stringify(stamp, null, 2));
rmSync(workDir, { recursive: true, force: true });
console.log(`Wrote ${output}`);
