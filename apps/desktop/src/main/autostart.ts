import { AUTOSTART_ENTRY_NAME } from '../shared/application-identity.js';

export interface AutostartApp {
  setLoginItemSettings(settings: {
    openAtLogin: boolean;
    args?: string[];
    name?: string;
  }): void;
  getLoginItemSettings(): { openAtLogin: boolean };
}

export function setAutostart(app: AutostartApp, enabled: boolean): boolean {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: ['--hidden'],
    name: AUTOSTART_ENTRY_NAME,
  });
  return app.getLoginItemSettings().openAtLogin;
}
