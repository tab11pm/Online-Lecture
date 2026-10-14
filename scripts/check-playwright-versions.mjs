import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = createRequire(resolve('package.json'));
const desktop = createRequire(resolve('apps/desktop/package.json'));
const sdo = createRequire(desktop.resolve('sdo_mcp/package.json'));

const versions = [root, desktop, sdo].map(
  (requirePackage) => requirePackage('playwright/package.json').version,
);
assert.equal(
  new Set(versions).size,
  1,
  `Playwright versions differ (core, desktop, SDO MCP): ${versions.join(', ')}`,
);
