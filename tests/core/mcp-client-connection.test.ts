import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SdoMcpClient } from '../../src/core/mcp-client.js';
import {
  appendTail,
  isSdoMcpUnavailableError,
  SdoMcpUnavailableError,
} from '../../src/core/mcp-errors.js';
import type { McpConfig } from '../../src/core/types.js';

function fixture(name: string): string {
  return fileURLToPath(new URL(`../fixtures/mcp/${name}`, import.meta.url));
}

function fixtureConfig(name: string, connectionTimeout = 5000): McpConfig {
  return {
    serverPath: process.execPath,
    args: [fixture(name)],
    source: 'bundled',
    connectionTimeout,
  };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

const clients: SdoMcpClient[] = [];
function track(client: SdoMcpClient): SdoMcpClient {
  clients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(
    clients.map((client) => client.close().catch(() => undefined)),
  );
  clients.length = 0;
});

describe('SdoMcpClient connection failures', () => {
  it('reports not_found when the server executable does not exist', async () => {
    const client = track(
      new SdoMcpClient({ serverPath: '/nonexistent/sdo-mcp', source: 'path' }),
    );

    const error = await failure(client.checkSdoAuth());

    expect(error).toBeInstanceOf(SdoMcpUnavailableError);
    expect(error).toMatchObject({ reason: 'not_found', source: 'path' });
  });

  it('reports exited with a redacted stderr tail when the server dies', async () => {
    const client = track(
      new SdoMcpClient(fixtureConfig('exit-with-stderr.mjs')),
    );

    const error = await failure(client.checkSdoAuth());

    expect(error).toMatchObject({ reason: 'exited', source: 'bundled' });
    const detail = (error as SdoMcpUnavailableError).detail;
    expect(detail).toContain('starting');
    expect(detail).not.toContain('abc123');
    expect(detail).not.toContain('xyz');
  });

  it('reports timeout and closes the transport when the handshake stalls', async () => {
    const client = track(new SdoMcpClient(fixtureConfig('silent.mjs', 500)));

    const first = await failure(client.checkSdoAuth());
    const second = await failure(client.checkSdoAuth());

    expect(first).toMatchObject({ reason: 'timeout' });
    expect(second).toMatchObject({ reason: 'timeout' });
  });

  it('connects to a server that answers before the timeout', async () => {
    const client = track(new SdoMcpClient(fixtureConfig('slow-ok.mjs', 3000)));

    await expect(
      (
        client as unknown as { ensureConnected(): Promise<void> }
      ).ensureConnected(),
    ).resolves.toBeUndefined();
  });

  it('keeps tool errors as plain errors', async () => {
    const client = new SdoMcpClient({ serverPath: 'sdo-mcp' });
    (client as unknown as { client: unknown }).client = {
      callTool: vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: 'browser crashed' }],
      }),
    };

    const error = await failure(client.checkSdoAuth());

    expect(isSdoMcpUnavailableError(error)).toBe(false);
  });
});

describe('appendTail', () => {
  it('keeps the text unchanged while under the limit', () => {
    expect(appendTail('start\n', 'more\n', 100)).toBe('start\nmore\n');
  });

  it('drops a cut line that has no line break after it', () => {
    expect(appendTail('a'.repeat(4096), 'bc')).toBe('');
  });

  it('drops a partial first line when truncating so a cut secret is not kept', () => {
    const tail = appendTail(
      'x'.repeat(10),
      'Token=abc123secret\nsafe line\n',
      25,
    );

    expect(tail).toBe('safe line\n');
  });
});
