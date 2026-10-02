export interface AutostartApp {
  setLoginItemSettings(settings: {
    openAtLogin: boolean;
    args?: string[];
  }): void;
  getLoginItemSettings(): { openAtLogin: boolean };
}

export function setAutostart(app: AutostartApp, enabled: boolean): boolean {
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
  return app.getLoginItemSettings().openAtLogin;
}
