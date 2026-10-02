import { describe, it, expect, vi } from 'vitest';
import { SdoMcpClient } from '../../src/core/mcp-client.js';

/**
 * Contract test with the real SDO MCP server (`sdo_mcp`).
 *
 * The server registers standard tools (`check_sdo_auth`, `list_courses`,
 * `find_course_module`, `get_assignment_details`, `resolve_online_lecture`)
 * and returns `content: [{ type: 'text', text: '<json>' }]`. This test pins the
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

  it('listCourses uses list_courses', async () => {
    const callTool = vi.fn().mockResolvedValue(text([]));
    const client = clientWith(callTool);

    await client.listCourses();

    expect(callTool.mock.calls[0]?.[0]).toEqual({
      name: 'list_courses',
      arguments: {},
    });
  });

  it('findCourseModule uses find_course_module', async () => {
    const callTool = vi
      .fn()
      .mockResolvedValue(
        text({
          courseUrl: 'https://sdo.tusur.ru/course/view.php?id=1',
          query: 'x',
          totalModules: 0,
          matches: [],
        }),
      );
    const client = clientWith(callTool);

    await client.findCourseModule(
      'https://sdo.tusur.ru/course/view.php?id=1',
      'x',
    );

    expect(callTool.mock.calls[0]?.[0]).toEqual({
      name: 'find_course_module',
      arguments: {
        courseUrl: 'https://sdo.tusur.ru/course/view.php?id=1',
        query: 'x',
      },
    });
  });

  it('getAssignmentDetails uses get_assignment_details', async () => {
    const callTool = vi.fn().mockResolvedValue(text('assignment body'));
    const client = clientWith(callTool);

    await client.getAssignmentDetails(
      'https://sdo.tusur.ru/mod/assign/view.php?id=5',
    );

    expect(callTool.mock.calls[0]?.[0]).toEqual({
      name: 'get_assignment_details',
      arguments: {
        assignmentUrl: 'https://sdo.tusur.ru/mod/assign/view.php?id=5',
      },
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
