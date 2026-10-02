import { fileURLToPath } from 'node:url';
import { BrowserWindow } from 'electron';

export interface MainWindowOptions {
  preloadPath?: string;
  rendererUrl?: string;
  rendererFile?: string;
  hidden?: boolean;
  isQuitting?: () => boolean;
}

export function createMainWindow(
  options: MainWindowOptions = {},
): BrowserWindow {
  const window = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    webPreferences: {
      preload:
        options.preloadPath ??
        fileURLToPath(new URL('../preload/index.mjs', import.meta.url)),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.on('close', (event) => {
    if (options.isQuitting?.()) {
      return;
    }
    event.preventDefault();
    window.hide();
  });

  window.on('ready-to-show', () => {
    if (!options.hidden) {
      window.show();
    }
  });

  if (options.rendererUrl) {
    void window.loadURL(options.rendererUrl);
  } else {
    void window.loadFile(
      options.rendererFile ??
        fileURLToPath(new URL('../renderer/index.html', import.meta.url)),
    );
  }

  return window;
}
