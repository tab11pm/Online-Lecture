import { loadMcpConfig } from '@core/config/mcp-config.js';
import { SdoMcpClient } from '@core/core/mcp-client.js';
import type { McpConfig } from '@core/core/types.js';
import type { LoginOutcome } from '../shared/onboarding.js';
import type { LoginCredentials, SessionProvider } from './session-provider.js';

export type SdoLoginResult = { status: string };

function toOutcome(result: SdoLoginResult): LoginOutcome {
  return result.status === 'logged_in'
    ? { ok: true }
    : { ok: false, reason: 'error' };
}

/**
 * Delegates TUSUR/SDO authentication to the SDO MCP server. The app never logs
 * in itself: it starts the server with the credentials in its environment and
 * calls `sdo_login`, which drives the cabinet SSO and saves the shared session
 * to `SDO_AUTH_STATE_PATH`.
 */
export class SdoMcpSessionProvider implements SessionProvider {
  constructor(private readonly config: McpConfig = loadMcpConfig()) {}

  private clientFor(input: {
    authStatePath: string;
    username?: string;
    password?: string;
    headless?: boolean;
  }): SdoMcpClient {
    return new SdoMcpClient({
      ...this.config,
      env: {
        ...this.config.env,
        SDO_AUTH_STATE_PATH: input.authStatePath,
        ...(input.username !== undefined
          ? { SDO_USERNAME: input.username }
          : {}),
        ...(input.password !== undefined
          ? { SDO_PASSWORD: input.password }
          : {}),
        ...(input.headless !== undefined
          ? { HEADLESS: input.headless ? 'true' : 'false' }
          : {}),
      },
    });
  }

  async loginWithCredentials({
    username,
    password,
    authStatePath,
  }: LoginCredentials): Promise<LoginOutcome> {
    return this.runLogin({ username, password, authStatePath, headless: true });
  }

  async openManualLogin(authStatePath: string): Promise<LoginOutcome> {
    // Headful run: the user sees the cabinet SSO window while the server drives
    // the login. Credentials come from the stored env of the running process.
    return this.runLogin({ authStatePath, headless: false });
  }

  async checkSession(authStatePath: string): Promise<boolean> {
    const client = this.clientFor({ authStatePath });
    try {
      return await client.checkSdoAuth();
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private async runLogin(input: {
    authStatePath: string;
    username?: string;
    password?: string;
    headless: boolean;
  }): Promise<LoginOutcome> {
    const client = this.clientFor(input);
    try {
      return toOutcome(await client.login());
    } catch (error) {
      return {
        ok: false,
        reason: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Не удалось выполнить вход через SDO MCP.',
      };
    } finally {
      await client.close().catch(() => undefined);
    }
  }
}
