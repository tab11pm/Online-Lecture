import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface PackagedRuntimeSmokeInput {
  executablePath: string;
  packageDir: string;
  cwd: string;
}

export interface ChildProcessOptions {
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
}

export type RunChildProcess = (
  command: string,
  args: readonly string[],
  options: ChildProcessOptions,
) => Promise<void>;

export interface McpHandshakeInput {
  executablePath: string;
  scriptPath: string;
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
}

export interface PackagedRuntimeSmokeDependencies {
  runChild?: RunChildProcess;
  handshake?: (input: McpHandshakeInput) => Promise<void>;
  timeoutMs?: number;
}

const MAX_CAPTURED_OUTPUT = 64 * 1024;

const PRESERVED_ENVIRONMENT = [
  'PATH',
  'Path',
  'SystemRoot',
  'windir',
  'TEMP',
  'TMP',
  'HOME',
  'USERPROFILE',
] as const;

/** Minimal environment for a packaged Electron-Node child process. */
export function createSmokeEnvironment(
  platform: NodeJS.Platform,
  base: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env: Record<string, string> = { ELECTRON_RUN_AS_NODE: '1' };
  for (const key of PRESERVED_ENVIRONMENT) {
    const value = base[key];
    if (value !== undefined) env[key] = value;
  }
  env.DOTENV_CONFIG_PATH = platform === 'win32' ? 'NUL' : '/dev/null';
  env.DOTENV_CONFIG_QUIET = 'true';
  env.DOTENV_CONFIG_DEBUG = 'false';
  return env;
}

export async function runChildProcess(
  command: string,
  args: readonly string[],
  options: ChildProcessOptions,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    let stdout = 0;
    let stderr = 0;
    let settled = false;
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolvePromise();
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('packaged runtime check timed out'));
    }, options.timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.length;
      if (stdout > MAX_CAPTURED_OUTPUT) child.kill('SIGKILL');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.length;
      if (stderr > MAX_CAPTURED_OUTPUT) child.kill('SIGKILL');
    });
    child.once('error', (error) => finish(error));
    child.once('close', (code) => {
      if (code === 0) {
        finish();
      } else {
        finish(new Error(`packaged runtime check exited with code ${code}`));
      }
    });
  });
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          onTimeout();
          reject(new Error('packaged runtime check timed out'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Performs only the MCP initialize handshake; no tools are called. */
export async function performMcpHandshake(
  input: McpHandshakeInput,
): Promise<void> {
  const transport = new StdioClientTransport({
    command: input.executablePath,
    args: [input.scriptPath],
    cwd: input.cwd,
    env: input.env,
    stderr: 'pipe',
  });
  const client = new Client({
    name: 'online-lecture-smoke',
    version: '0.0.0',
  });
  try {
    await withTimeout(client.connect(transport), input.timeoutMs, () => {
      void client.close().catch(() => undefined);
    });
  } finally {
    await client.close().catch(() => undefined);
  }
}

function requirePath(path: string, label: string): void {
  if (!existsSync(path)) {
    throw new Error(`packaged runtime is missing ${label}`);
  }
}

function resolvePlaywrightCli(unpackedRoot: string): string {
  const candidates = [
    join(unpackedRoot, 'node_modules', 'playwright', 'cli.js'),
    join(unpackedRoot, 'node_modules', 'playwright-core', 'cli.js'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('packaged runtime is missing the Playwright CLI');
}

function resolveSdoMcpEntry(unpackedRoot: string): string {
  const packageDir = join(unpackedRoot, 'node_modules', 'sdo_mcp');
  requirePath(join(packageDir, 'package.json'), 'sdo_mcp/package.json');
  const manifest = JSON.parse(
    readFileSync(join(packageDir, 'package.json'), 'utf8'),
  ) as { main?: unknown };
  const main =
    typeof manifest.main === 'string' ? manifest.main : 'dist/index.js';
  const entry = join(packageDir, main);
  requirePath(entry, 'the bundled SDO MCP entry');
  return entry;
}

/**
 * Exercises the packaged runtime without touching the network or TUSUR:
 * native SQLite, the unpacked Playwright CLI and the MCP initialize handshake.
 * Only codes and versions are observed; no environment is logged.
 */
export async function smokePackagedRuntime(
  input: PackagedRuntimeSmokeInput,
  deps: PackagedRuntimeSmokeDependencies = {},
): Promise<void> {
  const packageDir = resolve(input.packageDir);
  const resources = join(packageDir, 'resources');
  const unpackedRoot = join(resources, 'app.asar.unpacked');
  const nativePath = join(resources, 'native', 'better_sqlite3.node');

  requirePath(input.executablePath, 'the packaged executable');
  requirePath(unpackedRoot, 'the unpacked production dependencies');
  requirePath(nativePath, 'the native SQLite module');
  const playwrightCli = resolvePlaywrightCli(unpackedRoot);
  const sdoMcpEntry = resolveSdoMcpEntry(unpackedRoot);

  const env = createSmokeEnvironment(process.platform);
  const timeoutMs = deps.timeoutMs ?? 30_000;
  const run = deps.runChild ?? runChildProcess;
  const handshake = deps.handshake ?? performMcpHandshake;
  const tempDir = mkdtempSync(join(tmpdir(), 'online-lecture-smoke-'));

  try {
    const scriptPath = join(tempDir, 'sqlite-check.cjs');
    writeFileSync(
      scriptPath,
      [
        "const { createRequire } = require('node:module');",
        'const requireFromApp = createRequire(process.argv[3]);',
        "const Database = requireFromApp('better-sqlite3');",
        'const db = new Database(":memory:", { nativeBinding: process.argv[2] });',
        'db.prepare("SELECT 1 AS ok").get();',
        'db.close();',
        '',
      ].join('\n'),
      'utf8',
    );

    await run(
      input.executablePath,
      [scriptPath, nativePath, join(unpackedRoot, 'index.js')],
      { cwd: input.cwd, env, timeoutMs },
    );
    await run(input.executablePath, [playwrightCli, '--version'], {
      cwd: input.cwd,
      env,
      timeoutMs,
    });
    await handshake({
      executablePath: input.executablePath,
      scriptPath: sdoMcpEntry,
      cwd: input.cwd,
      env,
      timeoutMs,
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
