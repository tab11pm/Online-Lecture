import { createAppPaths } from '../shared/paths.js';
import type { HostEvent, MainCommand } from '../shared/host-protocol.js';
import { CoreHost, type HostTransport } from './core-host.js';

interface ParentPortMessageEvent {
  data: unknown;
}

interface ParentPortLike {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (event: ParentPortMessageEvent) => void): void;
}

// Electron injects `process.parentPort` inside a utility process. @types/node
// does not describe it, so we read it through a documented minimal interface
// instead of reaching for `any`.
function resolveParentPort(): ParentPortLike {
  const port = (process as unknown as { parentPort?: ParentPortLike })
    .parentPort;
  if (!port) {
    throw new Error('worker/entry must run inside an Electron utility process');
  }
  return port;
}

const userDataDir = process.argv[2];
if (!userDataDir) {
  throw new Error('worker/entry requires the userData directory argument');
}

const parentPort = resolveParentPort();
const transport: HostTransport = {
  post: (event: HostEvent) => {
    parentPort.postMessage(event);
  },
  onMessage: (handler) => {
    parentPort.on('message', (event) => {
      handler(event.data as MainCommand);
    });
  },
};

new CoreHost(transport, { paths: createAppPaths(userDataDir) }).start();
