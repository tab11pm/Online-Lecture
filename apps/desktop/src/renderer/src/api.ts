export interface DesktopApi {
  ping(): Promise<string>;
}

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}

export const desktop = window.desktop;
