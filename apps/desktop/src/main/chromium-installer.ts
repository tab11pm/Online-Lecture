import { spawn, type ChildProcess } from 'node:child_process';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromiumExecutablePaths } from '@core/core/chromium-executables.js';
import type { BrowserInstallState } from '../shared/browser-choice.js';

const require = createRequire(import.meta.url);

export function resolvePlaywrightCliPath(packagePath: string): string {
  return packagePath
    .replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2')
    .replace(/package\.json$/, 'cli.js');
}

async function defaultFileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface ChromiumInstallerOptions {
  executablePaths?: () => string[];
  fileExists?: (path: string) => Promise<boolean>;
  spawn?: typeof spawn;
  resolveCliPath?: () => string;
  nodePath?: string;
  env?: NodeJS.ProcessEnv;
  onChanged?: (state: BrowserInstallState) => void;
}

export class ChromiumInstaller {
  private state: BrowserInstallState = { status: 'missing' };
  private inFlight: Promise<BrowserInstallState> | undefined;

  constructor(private readonly options: ChromiumInstallerOptions = {}) {}

  private get executablePaths(): () => string[] {
    return this.options.executablePaths ?? chromiumExecutablePaths;
  }

  private get fileExists(): (path: string) => Promise<boolean> {
    return this.options.fileExists ?? defaultFileExists;
  }

  private publish(state: BrowserInstallState): BrowserInstallState {
    if (
      this.state.status === state.status &&
      this.state.message === state.message
    ) {
      return this.state;
    }
    this.state = state;
    this.options.onChanged?.(state);
    return state;
  }

  private async isAvailable(): Promise<boolean> {
    try {
      const paths = this.executablePaths();
      return (
        paths.length > 0 &&
        (await Promise.all(paths.map(this.fileExists))).every(Boolean)
      );
    } catch {
      return false;
    }
  }

  async getState(): Promise<BrowserInstallState> {
    if (this.inFlight || this.state.status === 'error') {
      return this.state;
    }
    const available = await this.isAvailable();
    return this.publish({ status: available ? 'available' : 'missing' });
  }

  install(): Promise<BrowserInstallState> {
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.runInstall().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async runInstall(): Promise<BrowserInstallState> {
    if (await this.isAvailable()) {
      return this.publish({ status: 'available' });
    }
    this.publish({ status: 'installing' });
    try {
      const cli = (
        this.options.resolveCliPath ??
        (() =>
          resolvePlaywrightCliPath(require.resolve('playwright/package.json')))
      )();
      const child: ChildProcess = (this.options.spawn ?? spawn)(
        this.options.nodePath ?? process.execPath,
        [cli, 'install', 'chromium'],
        {
          env: {
            ...(this.options.env ?? process.env),
            ELECTRON_RUN_AS_NODE: '1',
          },
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      child.stdout?.on('data', () => {
        this.publish({ status: 'installing', message: 'Загрузка Chromium…' });
      });
      child.stderr?.on('data', () => {
        this.publish({ status: 'installing', message: 'Загрузка Chromium…' });
      });
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });
      if (exitCode !== 0 || !(await this.isAvailable())) {
        return this.publish({
          status: 'error',
          message: 'Не удалось установить Chromium. Повторите попытку.',
        });
      }
      return this.publish({ status: 'available' });
    } catch {
      return this.publish({
        status: 'error',
        message: 'Не удалось установить Chromium. Повторите попытку.',
      });
    }
  }
}
