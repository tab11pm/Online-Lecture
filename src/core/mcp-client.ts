import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  appendTail,
  SdoMcpUnavailableError,
  type SdoMcpUnavailableReason,
} from './mcp-errors.js';
import { redactSensitiveText } from './redaction.js';
import type {
  McpConfig,
  OnlineLectureResolution,
  OnlineLectureResolver,
} from './types.js';

// Matches the default of loadMcpConfig for configs built by hand.
const DEFAULT_CONNECTION_TIMEOUT_MS = 30_000;

class HandshakeTimeout extends Error {}

function classifyConnectError(error: unknown): SdoMcpUnavailableReason {
  if (error instanceof HandshakeTimeout) {
    return 'timeout';
  }
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'ENOENT' || code === 'EACCES' ? 'not_found' : 'exited';
}

/**
 * SDO MCP Client - communicates with the SDO MCP server via stdio protocol.
 *
 * The server authenticates through the shared Playwright storage state
 * (`SDO_AUTH_STATE_PATH`); there is no credential or token exchange.
 */
export class SdoMcpClient implements OnlineLectureResolver {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private config: McpConfig;

  constructor(config: McpConfig) {
    this.config = config;
  }

  /**
   * Initialize MCP client connection.
   *
   * Startup failures become `SdoMcpUnavailableError` with a redacted stderr
   * tail; the handshake is bounded by `connectionTimeout`.
   */
  private async ensureConnected(): Promise<void> {
    if (this.client) {
      return;
    }

    const transport = new StdioClientTransport({
      command: this.config.serverPath,
      args: this.config.args ?? [],
      ...(this.config.cwd ? { cwd: this.config.cwd } : {}),
      ...(this.config.env ? { env: this.config.env } : {}),
      stderr: 'pipe',
    });
    let stderrTail = '';
    transport.stderr?.on('data', (chunk: Buffer | string) => {
      stderrTail = appendTail(stderrTail, chunk.toString());
    });

    const client = new Client(
      {
        name: 'online-lecture',
        version: '0.1.0',
      },
      {
        capabilities: {},
      },
    );

    const timeoutMs =
      this.config.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT_MS;
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new HandshakeTimeout()), timeoutMs);
    });

    try {
      await Promise.race([client.connect(transport), timedOut]);
    } catch (error) {
      await transport.close().catch(() => undefined);
      // Let stderr chunks already emitted by the dead process land.
      await new Promise((resolve) => setImmediate(resolve));
      throw new SdoMcpUnavailableError(
        classifyConnectError(error),
        this.config.source,
        redactSensitiveText(stderrTail.trim()),
      );
    } finally {
      clearTimeout(timer);
    }

    this.client = client;
    this.transport = transport;
  }

  private async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    await this.ensureConnected();

    if (!this.client) {
      throw new Error('MCP client not initialized');
    }

    return (await this.client.callTool({
      name,
      arguments: args,
    })) as CallToolResult;
  }

  private static readText(name: string, result: CallToolResult): string {
    const textBlock = result.content.find(
      (block): block is { type: 'text'; text: string } =>
        block.type === 'text' && typeof block.text === 'string',
    );

    if (textBlock === undefined) {
      throw new Error(`Empty ${name} response`);
    }

    if (result.isError === true) {
      throw new Error(`${name} failed: ${textBlock.text}`);
    }

    return textBlock.text;
  }

  private async callJsonTool<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const text = SdoMcpClient.readText(name, await this.callTool(name, args));

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Invalid ${name} response`);
    }
  }

  /**
   * Check whether the locally stored SDO session is still valid
   */
  async checkSdoAuth(): Promise<boolean> {
    const result = await this.callJsonTool<{ authenticated: boolean }>(
      'check_sdo_auth',
      {},
    );

    return result.authenticated === true;
  }

  /**
   * Log into SDO through the TUSUR cabinet SSO and persist the session to the
   * server's configured `SDO_AUTH_STATE_PATH`.
   */
  async login(): Promise<{ status: string }> {
    return this.callJsonTool<{ status: string }>('sdo_login', {});
  }

  /**
   * Resolve an online lecture to a course and BBB module via the MCP server
   */
  async resolveOnlineLecture(input: {
    courseUrl?: string;
    courseQuery?: string;
    lectureQuery?: string;
  }): Promise<OnlineLectureResolution> {
    return this.callJsonTool<OnlineLectureResolution>(
      'resolve_online_lecture',
      input,
    );
  }

  /**
   * Close the MCP connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.transport = null;
    }
  }
}
