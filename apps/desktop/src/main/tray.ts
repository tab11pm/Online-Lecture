import { Menu, nativeImage, Tray, type NativeImage } from 'electron';

export interface TrayOptions {
  icon?: NativeImage;
  tooltip?: string;
  onOpen: () => void;
  onQuit: () => void;
}

export function createTray(options: TrayOptions): Tray {
  const tray = new Tray(options.icon ?? nativeImage.createEmpty());
  tray.setToolTip(options.tooltip ?? 'Online Lecture');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Открыть', click: options.onOpen },
      { label: 'Остановить лекцию', enabled: false },
      { type: 'separator' },
      { label: 'Выход', click: options.onQuit },
    ]),
  );
  tray.on('click', options.onOpen);
  return tray;
}
