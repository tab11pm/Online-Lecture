import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AppSettings {
  autostart: boolean;
  username?: string;
}

export interface SettingsStore {
  read(): Promise<AppSettings>;
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
}

const DEFAULT_SETTINGS: AppSettings = { autostart: false };

function parseSettings(raw: string): AppSettings | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  const settings: AppSettings = { autostart: record['autostart'] === true };
  if (typeof record['username'] === 'string') {
    settings.username = record['username'];
  }
  return settings;
}

const SettingsStore = class SettingsStoreImpl implements SettingsStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<AppSettings> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
    const settings = parseSettings(raw);
    if (!settings) {
      console.warn(
        `[SettingsStore] ignoring corrupted settings file: ${this.filePath}`,
      );
      return { ...DEFAULT_SETTINGS };
    }
    return settings;
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.read();
    const next: AppSettings = { ...current };
    if (typeof patch.autostart === 'boolean') {
      next.autostart = patch.autostart;
    }
    if (typeof patch.username === 'string') {
      next.username = patch.username;
    }
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }
};

export { SettingsStore };
