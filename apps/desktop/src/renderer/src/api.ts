import type { DesktopApi } from '../../shared/ipc-contract.js';

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}

export const desktop = window.desktop;
