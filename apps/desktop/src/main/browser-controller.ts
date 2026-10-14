import type {
  BrowserChoice,
  BrowserInstallState,
  BrowserView,
} from '../shared/browser-choice.js';
import type { SettingsStore } from './settings-store.js';

export interface BrowserControllerDependencies {
  settings: Pick<SettingsStore, 'read' | 'update'>;
  installer: {
    getState(): Promise<BrowserInstallState>;
    install(): Promise<BrowserInstallState>;
  };
  core: { setBrowserChoice(choice: BrowserChoice): void };
  platform: NodeJS.Platform;
  externalChannel?: string;
  onChanged?: (view: BrowserView) => void;
}

export class BrowserController {
  constructor(private readonly deps: BrowserControllerDependencies) {}

  private async choice(): Promise<BrowserChoice> {
    const settings = await this.deps.settings.read();
    return (
      settings.browser ?? (this.deps.platform === 'win32' ? 'edge' : 'chromium')
    );
  }

  private async view(install: BrowserInstallState): Promise<BrowserView> {
    return {
      choice: await this.choice(),
      install,
      ...(this.deps.externalChannel !== undefined
        ? { externalChannel: this.deps.externalChannel }
        : {}),
    };
  }

  async getBrowser(): Promise<BrowserView> {
    return this.view(await this.deps.installer.getState());
  }

  async setBrowser(choice: BrowserChoice): Promise<BrowserView> {
    if (choice !== 'edge' && choice !== 'chromium') {
      throw new Error('Недопустимый браузер.');
    }
    const install = await this.deps.installer.getState();
    if (choice === 'chromium' && install.status !== 'available') {
      return this.view(install);
    }
    await this.deps.settings.update({ browser: choice });
    this.deps.core.setBrowserChoice(choice);
    const view = await this.view(install);
    this.deps.onChanged?.(view);
    return view;
  }

  async installChromium(): Promise<BrowserView> {
    const install = await this.deps.installer.install();
    if (install.status === 'available') {
      await this.deps.settings.update({ browser: 'chromium' });
      this.deps.core.setBrowserChoice('chromium');
    }
    const view = await this.view(install);
    this.deps.onChanged?.(view);
    return view;
  }

  async assertReady(): Promise<void> {
    const choice = await this.choice();
    const usesChromium =
      this.deps.externalChannel === '' ||
      (this.deps.externalChannel === undefined && choice === 'chromium');
    if (
      usesChromium &&
      (await this.deps.installer.getState()).status !== 'available'
    ) {
      throw new Error(
        'Chromium не установлен. Установите Chromium в приложении.',
      );
    }
  }
}
