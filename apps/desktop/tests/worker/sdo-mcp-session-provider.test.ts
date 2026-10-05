import { describe, it, expect, vi, afterEach } from 'vitest';
import { SdoMcpClient } from '@core/core/mcp-client.js';
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
});
