import { describe, it, expect, vi } from 'vitest';
import { SdoMcpClient } from '../../src/core/mcp-client.js';

/**
 * Contract test with the real SDO MCP server (`sdo_mcp`).
 *
 * The server registers the tools this app uses (`check_sdo_auth`, `sdo_login`,
 * `resolve_online_lecture`) and returns `content: [{ type: 'text', text: '<json>' }]`. This test pins the
 * tool names and argument shapes so a renamed or re-shaped tool fails loudly.
 */
function clientWith(callTool: ReturnType<typeof vi.fn>): SdoMcpClient {
  const client = new SdoMcpClient({ serverPath: 'sdo-mcp' });
  (client as unknown as { client: unknown }).client = { callTool };
  return client;
}

function text(payload: unknown) {
  return {
    content: [
      {
        type: 'text',
        text: typeof payload === 'string' ? payload : JSON.stringify(payload),
      },
    ],
  };
}

describe('SDO MCP server contract', () => {
  it('checkSdoAuth uses check_sdo_auth', async () => {
    const callTool = vi.fn().mockResolvedValue(text({ authenticated: true }));
    const client = clientWith(callTool);

    await client.checkSdoAuth();

    expect(callTool.mock.calls[0]?.[0]).toEqual({
      name: 'check_sdo_auth',
      arguments: {},
    });
  });

  it('resolveOnlineLecture uses resolve_online_lecture', async () => {
    const callTool = vi
      .fn()
      .mockResolvedValue(text({ status: 'auth_required' }));
    const client = clientWith(callTool);

    await client.resolveOnlineLecture({ courseQuery: 'РМП2' });

    expect(callTool.mock.calls[0]?.[0]).toEqual({
      name: 'resolve_online_lecture',
      arguments: { courseQuery: 'РМП2' },
    });
  });

  it('never falls back to the removed sdo/* request scheme', async () => {
    const callTool = vi.fn().mockResolvedValue(text({ authenticated: false }));
    const client = clientWith(callTool);

    await client.checkSdoAuth();

    const usedNames = callTool.mock.calls.map(
      ([call]) => (call as { name: string }).name,
    );
    expect(usedNames.every((name) => !name.startsWith('sdo/'))).toBe(true);
  });
});
