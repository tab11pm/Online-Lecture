import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    webPreferences: {
      preload: fileURLToPath(new URL('../preload/index.mjs', import.meta.url)),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.on('ready-to-show', () => {
    window.show();
  });

  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(
      fileURLToPath(new URL('../renderer/index.html', import.meta.url)),
    );
  }
}

void app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
