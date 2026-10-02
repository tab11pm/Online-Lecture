import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsStore } from '../../src/main/settings-store.js';

describe('SettingsStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'settings-'));
  });

  it('defaults to autostart disabled', async () => {
    const store = new SettingsStore(join(dir, 'settings.json'));
    expect(await store.read()).toEqual({ autostart: false });
  });

  it('persists an update and merges patches', async () => {
    const store = new SettingsStore(join(dir, 'settings.json'));
    expect(await store.update({ autostart: true })).toEqual({
      autostart: true,
    });
    expect(await new SettingsStore(join(dir, 'settings.json')).read()).toEqual({
      autostart: true,
    });
  });

  it('falls back to defaults on corrupted JSON', async () => {
    const file = join(dir, 'settings.json');
    await writeFile(file, '{ not json');
    expect(await new SettingsStore(file).read()).toEqual({ autostart: false });
  });
});
