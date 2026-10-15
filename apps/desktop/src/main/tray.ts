import { Menu, nativeImage, Tray, type NativeImage } from 'electron';
import { TRAY_ICON_DATA_URL } from './tray-icon.js';
import type { TrayState } from './tray-state.js';

export interface TrayOptions {
  icon?: NativeImage;
  tooltip?: string;
  onOpen: () => void;
  onQuit: () => void;
}

export function createTray(options: TrayOptions & { onStop(): void }): {
  tray: Tray;
  update(state: TrayState): void;
} {
  const tray = new Tray(
    options.icon ?? nativeImage.createFromDataURL(TRAY_ICON_DATA_URL),
  );
  tray.setToolTip(options.tooltip ?? 'Online Lecture');
  const update = (state: TrayState): void => {
    tray.setToolTip(state.tooltip);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: state.status, enabled: false },
        { label: 'Открыть', click: options.onOpen },
        {
          label: 'Остановить лекцию',
          enabled: state.canStop,
          click: options.onStop,
        },
        { type: 'separator' },
        { label: 'Выход', click: options.onQuit },
      ]),
    );
  };
  update({
    tooltip: options.tooltip ?? 'Online Lecture',
    status: 'Онлайн-пар нет',
    canStop: false,
  });
  tray.on('click', options.onOpen);
  return { tray, update };
}
