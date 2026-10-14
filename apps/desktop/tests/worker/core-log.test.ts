import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCoreLog } from '../../src/worker/core-log.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'online-lecture-log-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('createCoreLog', () => {
  it('appends timestamped lines', () => {
    const file = join(root, 'core.log');

    createCoreLog(file).info('hello');

    expect(readFileSync(file, 'utf8').trimEnd()).toMatch(
      /^\d{4}-\d{2}-\d{2}T.+ INFO hello$/,
    );
  });

  it('redacts secrets before writing', () => {
    const file = join(root, 'core.log');

    createCoreLog(file).error('cookie: session=abc https://x/?token=xyz');

    const written = readFileSync(file, 'utf8');
    expect(written).toContain('ERROR');
    expect(written).not.toContain('abc');
    expect(written).not.toContain('xyz');
  });

  it('rotates to core.log.1 past the size limit', () => {
    const file = join(root, 'core.log');
    const log = createCoreLog(file, 100);

    for (let i = 0; i < 3; i += 1) {
      log.info('x'.repeat(60));
    }

    expect(existsSync(`${file}.1`)).toBe(true);
    expect(statSync(file).size).toBeLessThan(100);
  });

  it('creates the logs directory on first write', () => {
    const file = join(root, 'nested', 'logs', 'core.log');

    createCoreLog(file).info('first');

    expect(existsSync(file)).toBe(true);
  });

  it('never throws when the file cannot be written', () => {
    const blocker = join(root, 'not-a-dir');
    writeFileSync(blocker, '', 'utf8');

    expect(() =>
      createCoreLog(join(blocker, 'core.log')).info('lost'),
    ).not.toThrow();
  });

  it('exposes its file path', () => {
    const file = join(root, 'core.log');

    expect(createCoreLog(file).path).toBe(file);
  });
});
