import { join } from 'node:path';
import { loadMcpConfig } from '@core/config/mcp-config.js';
import { createAppPaths } from '../shared/paths.js';
import type { HostEvent, MainCommand } from '../shared/host-protocol.js';
import { CoreHost, type HostTransport } from './core-host.js';
import { createCoreLog } from './core-log.js';
import { createLectureAdapters } from './lecture-adapters.js';
import { createFakeLectureAdapters } from './lecture-adapters.fake.js';
import { LectureService, type LectureAdapters } from './lecture-service.js';
import { SdoMcpSessionProvider } from './sdo-mcp-session-provider.js';
import { FakeSessionProvider } from './session-provider.fake.js';

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

const paths = createAppPaths(userDataDir);
const log = createCoreLog(join(paths.logs, 'core.log'));

const fakeSession = process.env.ONLINE_LECTURE_FAKE_SESSION === '1';

function createProvider(): SdoMcpSessionProvider | FakeSessionProvider {
  if (fakeSession) {
    return new FakeSessionProvider();
  }
  const config = loadMcpConfig();
  const externalChannel = process.argv[3] === '1' ? process.argv[4] : undefined;
  // Command and source only: the server environment carries credentials.
  log.info(
    `sdo-mcp source=${config.source ?? 'unknown'} command=${[config.serverPath, ...(config.args ?? [])].join(' ')}`,
  );
  return new SdoMcpSessionProvider(config, externalChannel);
}

const provider = createProvider();

function createAdapters(): LectureAdapters {
  if (provider instanceof SdoMcpSessionProvider) {
    return createLectureAdapters({
      authStatePath: paths.authState,
      createMcpClient: () => provider.createClient(paths.authState),
    });
  }
  return createFakeLectureAdapters(() => new Date());
}

const adapters = createAdapters();

new CoreHost(transport, {
  paths,
  provider,
  log,
  lectures: (events) =>
    new LectureService({
      databasePath: paths.database,
      sqliteBinding: process.env.ONLINE_LECTURE_SQLITE_BINDING,
      adapters,
      now: () => new Date(),
      onView: events.onView,
      onAuthRequired: events.onAuthRequired,
      log,
    }),
}).start();
