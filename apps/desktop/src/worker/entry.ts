import { join } from 'node:path';
import { createAppPaths } from '../shared/paths.js';
import type { HostEvent, MainCommand } from '../shared/host-protocol.js';
import { decodeWorkerStartup } from '../shared/worker-startup.js';
import { loadDesktopMcpConfig } from './desktop-mcp-config.js';
import { CoreHost, type HostTransport } from './core-host.js';
import { createCoreLog } from './core-log.js';
import { createLectureAdapters } from './lecture-adapters.js';
import { createFakeLectureAdapters } from './lecture-adapters.fake.js';
import { createFakeClock } from './fake-clock.js';
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

const startup = decodeWorkerStartup(process.argv.slice(2));
const userDataDir = startup.userDataDir;

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
const now = fakeSession ? createFakeClock() : () => new Date();

function createProvider(): SdoMcpSessionProvider | FakeSessionProvider {
  if (fakeSession) {
    return new FakeSessionProvider();
  }
  const config = loadDesktopMcpConfig({
    runtimeMode: startup.runtimeMode,
    platform: process.platform,
  });
  const externalChannel = startup.externalChannel;
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
  return createFakeLectureAdapters(now);
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
      now,
      onView: events.onView,
      onAuthRequired: events.onAuthRequired,
      onJournalEvent: events.onJournalEvent,
      log,
    }),
}).start();
