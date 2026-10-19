import { isRuntimeMode, type RuntimeMode } from './runtime-mode.js';

export interface WorkerStartupOptions {
  userDataDir: string;
  externalChannel?: string;
  runtimeMode: RuntimeMode;
}

/**
 * Serializes worker startup into positional arguments. The first three
 * arguments keep the historical layout; the fourth is the trusted runtime
 * mode chosen by the main process.
 */
export function encodeWorkerStartup(options: WorkerStartupOptions): string[] {
  return [
    options.userDataDir,
    options.externalChannel === undefined ? '0' : '1',
    options.externalChannel ?? '',
    options.runtimeMode,
  ];
}

export function decodeWorkerStartup(
  args: readonly string[],
): WorkerStartupOptions {
  const [userDataDir, hasExternal, channel, mode] = args;
  if (!userDataDir) {
    throw new Error('worker requires the userData directory argument');
  }
  if (hasExternal !== undefined && hasExternal !== '0' && hasExternal !== '1') {
    throw new Error('worker received an invalid external channel flag');
  }
  if (mode !== undefined && !isRuntimeMode(mode)) {
    throw new Error('worker received an invalid runtime mode');
  }
  return {
    userDataDir,
    ...(hasExternal === '1' ? { externalChannel: channel ?? '' } : {}),
    runtimeMode: mode ?? 'development',
  };
}
