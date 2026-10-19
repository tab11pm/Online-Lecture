import { APPLICATION_ID } from '../shared/application-identity.js';

export interface InstanceApp {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(event: 'second-instance', listener: () => void): unknown;
  setAppUserModelId(id: string): void;
}

export interface StartApplicationInstanceInput {
  app: InstanceApp;
  platform: NodeJS.Platform;
  onOpen(): void;
  startPrimary(markReady: () => void): void;
}

/**
 * Enforces one running application instance and, on Windows, the identity used
 * by notifications and the taskbar.
 *
 * A second launch before the first window exists is remembered and delivered
 * once when the primary startup marks itself ready; launches afterwards open
 * the existing window directly.
 */
export function startApplicationInstance(
  input: StartApplicationInstanceInput,
): void {
  if (!input.app.requestSingleInstanceLock()) {
    input.app.quit();
    return;
  }

  if (input.platform === 'win32') {
    input.app.setAppUserModelId(APPLICATION_ID);
  }

  let ready = false;
  let pendingOpen = false;
  input.app.on('second-instance', () => {
    if (ready) {
      input.onOpen();
    } else {
      pendingOpen = true;
    }
  });

  let marked = false;
  input.startPrimary(() => {
    if (marked) {
      return;
    }
    marked = true;
    ready = true;
    if (pendingOpen) {
      pendingOpen = false;
      input.onOpen();
    }
  });
}
