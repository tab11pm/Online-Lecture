import { describe, it, expect, vi, afterEach } from 'vitest';
import { SdoMcpClient } from '@core/core/mcp-client.js';
import { SdoMcpUnavailableError } from '@core/core/mcp-errors.js';
import { SdoMcpSessionProvider } from '../../src/worker/sdo-mcp-session-provider.js';

const config = { serverPath: 'sdo-mcp', args: [] as string[] };
const input = {
  username: 'student',
  password: 'secret',
  authStatePath: '/data/auth.json',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SdoMcpSessionProvider', () => {
  it('uses Chromium for later MCP clients after a choice change', async () => {
    const channels: unknown[] = [];
    vi.spyOn(SdoMcpClient.prototype, 'login').mockImplementation(
      async function () {
        channels.push(
          (this as unknown as { config: { env?: NodeJS.ProcessEnv } }).config
            .env?.SDO_BROWSER_CHANNEL,
        );
        return { status: 'logged_in' };
      },
    );
    vi.spyOn(SdoMcpClient.prototype, 'close').mockResolvedValue(undefined);
    const provider = new SdoMcpSessionProvider(config);
    provider.setBrowserChoice('edge');
    await provider.loginWithCredentials(input);
    provider.setBrowserChoice('chromium');
    await provider.loginWithCredentials(input);
    expect(channels).toEqual(['msedge', '']);
  });

  it('preserves an explicit empty external channel', async () => {
    let channel: unknown;
    vi.spyOn(SdoMcpClient.prototype, 'login').mockImplementation(
      async function () {
        channel = (this as unknown as { config: { env?: NodeJS.ProcessEnv } })
          .config.env?.SDO_BROWSER_CHANNEL;
        return { status: 'logged_in' };
      },
    );
    vi.spyOn(SdoMcpClient.prototype, 'close').mockResolvedValue(undefined);
    const provider = new SdoMcpSessionProvider(config, '');
    provider.setBrowserChoice('edge');
    await provider.loginWithCredentials(input);
    expect(channel).toBe('');
  });
  it('maps a successful sdo_login to { ok: true }', async () => {
    const login = vi
      .spyOn(SdoMcpClient.prototype, 'login')
      .mockResolvedValue({ status: 'logged_in' });
    vi.spyOn(SdoMcpClient.prototype, 'close').mockResolvedValue(undefined);

    const provider = new SdoMcpSessionProvider(config);

    await expect(provider.loginWithCredentials(input)).resolves.toEqual({
      ok: true,
    });
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('maps an unexpected status to a redacted error outcome', async () => {
    vi.spyOn(SdoMcpClient.prototype, 'login').mockResolvedValue({
      status: 'failed',
    });
    vi.spyOn(SdoMcpClient.prototype, 'close').mockResolvedValue(undefined);

    const provider = new SdoMcpSessionProvider(config);

    await expect(provider.loginWithCredentials(input)).resolves.toMatchObject({
      ok: false,
      reason: 'error',
    });
  });

  it('returns an error outcome instead of throwing when the tool call fails', async () => {
    vi.spyOn(SdoMcpClient.prototype, 'login').mockRejectedValue(
      new Error('SDO page unavailable'),
    );
    vi.spyOn(SdoMcpClient.prototype, 'close').mockResolvedValue(undefined);

    const provider = new SdoMcpSessionProvider(config);

    await expect(provider.loginWithCredentials(input)).resolves.toMatchObject({
      ok: false,
      reason: 'error',
    });
  });

  it('checkSession delegates to check_sdo_auth', async () => {
    const check = vi
      .spyOn(SdoMcpClient.prototype, 'checkSdoAuth')
      .mockResolvedValue(true);
    vi.spyOn(SdoMcpClient.prototype, 'close').mockResolvedValue(undefined);

    const provider = new SdoMcpSessionProvider(config);

    await expect(provider.checkSession('/data/auth.json')).resolves.toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('rethrows SDO MCP unavailability from login instead of mapping it to an outcome', async () => {
    const unavailable = new SdoMcpUnavailableError('not_found', 'path', '');
    vi.spyOn(SdoMcpClient.prototype, 'login').mockRejectedValue(unavailable);
    vi.spyOn(SdoMcpClient.prototype, 'close').mockResolvedValue(undefined);

    const provider = new SdoMcpSessionProvider(config);

    await expect(provider.loginWithCredentials(input)).rejects.toBe(
      unavailable,
    );
    await expect(provider.openManualLogin('/data/auth.json')).rejects.toBe(
      unavailable,
    );
  });
});
