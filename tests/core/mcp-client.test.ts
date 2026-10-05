import { describe, it, expect, vi } from 'vitest';
import { SdoMcpClient } from '../../src/core/mcp-client.js';

function clientWith(callTool: ReturnType<typeof vi.fn>): SdoMcpClient {
  const client = new SdoMcpClient({
    serverPath: '/path/to/sdo-mcp',
    connectionTimeout: 5000,
  });
  (client as unknown as { client: unknown }).client = { callTool };
  return client;
}

function textResult(text: string) {
  return { content: [{ type: 'text', text }] };
}

describe('SdoMcpClient', () => {
  describe('connection lifecycle', () => {
    it('closes without error when never connected', async () => {
      const client = new SdoMcpClient({ serverPath: '/path/to/sdo-mcp' });

      await expect(client.close()).resolves.toBeUndefined();
    });
  });

  describe('checkSdoAuth', () => {
    it('calls check_sdo_auth and returns the authenticated flag', async () => {
      const callTool = vi
        .fn()
        .mockResolvedValue(textResult(JSON.stringify({ authenticated: true })));
      const client = clientWith(callTool);

      await expect(client.checkSdoAuth()).resolves.toBe(true);
      expect(callTool).toHaveBeenCalledWith({
        name: 'check_sdo_auth',
        arguments: {},
      });
    });

    it('returns false when the session is invalid', async () => {
      const callTool = vi
        .fn()
        .mockResolvedValue(
          textResult(JSON.stringify({ authenticated: false })),
        );
      const client = clientWith(callTool);

      await expect(client.checkSdoAuth()).resolves.toBe(false);
    });
  });

  describe('login', () => {
    it('calls sdo_login and returns the status', async () => {
      const callTool = vi
        .fn()
        .mockResolvedValue(textResult(JSON.stringify({ status: 'logged_in' })));
      const client = clientWith(callTool);

      await expect(client.login()).resolves.toEqual({ status: 'logged_in' });
      expect(callTool).toHaveBeenCalledWith({
        name: 'sdo_login',
        arguments: {},
      });
    });
  });

  describe('listCourses', () => {
    it('maps title and url from list_courses into Course objects', async () => {
      const callTool = vi.fn().mockResolvedValue(
        textResult(
          JSON.stringify([
            {
              title: 'РМП2',
              url: 'https://sdo.tusur.ru/course/view.php?id=22413',
            },
            {
              title: 'РВП',
              url: 'https://sdo.tusur.ru/course/view.php?id=22414',
            },
          ]),
        ),
      );
      const client = clientWith(callTool);

      await expect(client.listCourses()).resolves.toEqual([
        {
          id: '22413',
          name: 'РМП2',
          url: 'https://sdo.tusur.ru/course/view.php?id=22413',
        },
        {
          id: '22414',
          name: 'РВП',
          url: 'https://sdo.tusur.ru/course/view.php?id=22414',
        },
      ]);
      expect(callTool).toHaveBeenCalledWith({
        name: 'list_courses',
        arguments: {},
      });
    });
  });

  describe('findCourseModule', () => {
    it('passes courseUrl and query and returns the matches payload', async () => {
      const payload = {
        courseUrl: 'https://sdo.tusur.ru/course/view.php?id=22413',
        query: 'лекция',
        totalModules: 3,
        matches: [
          {
            title: 'Онлайн-лекция',
            url: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=1',
            type: 'bigbluebuttonbn',
            score: 2,
          },
        ],
      };
      const callTool = vi
        .fn()
        .mockResolvedValue(textResult(JSON.stringify(payload)));
      const client = clientWith(callTool);

      await expect(
        client.findCourseModule(
          'https://sdo.tusur.ru/course/view.php?id=22413',
          'лекция',
        ),
      ).resolves.toEqual(payload);
      expect(callTool).toHaveBeenCalledWith({
        name: 'find_course_module',
        arguments: {
          courseUrl: 'https://sdo.tusur.ru/course/view.php?id=22413',
          query: 'лекция',
        },
      });
    });
  });

  describe('getAssignmentDetails', () => {
    it('returns the raw text of the assignment page', async () => {
      const callTool = vi.fn().mockResolvedValue(textResult('Текст задания'));
      const client = clientWith(callTool);

      await expect(
        client.getAssignmentDetails(
          'https://sdo.tusur.ru/mod/assign/view.php?id=5',
        ),
      ).resolves.toBe('Текст задания');
      expect(callTool).toHaveBeenCalledWith({
        name: 'get_assignment_details',
        arguments: {
          assignmentUrl: 'https://sdo.tusur.ru/mod/assign/view.php?id=5',
        },
      });
    });
  });

  describe('resolveOnlineLecture', () => {
    it('calls the resolve_online_lecture tool and parses the JSON result', async () => {
      const callTool = vi
        .fn()
        .mockResolvedValue(textResult(JSON.stringify({ status: 'not_found' })));
      const client = clientWith(callTool);

      await expect(
        client.resolveOnlineLecture({
          courseUrl: 'https://sdo.tusur.ru/course/view.php?id=22413',
        }),
      ).resolves.toEqual({ status: 'not_found' });

      expect(callTool).toHaveBeenCalledWith({
        name: 'resolve_online_lecture',
        arguments: {
          courseUrl: 'https://sdo.tusur.ru/course/view.php?id=22413',
        },
      });
    });

    it('parses a resolved payload with course and module', async () => {
      const payload = {
        status: 'resolved',
        course: { id: '22413', name: 'РМП2' },
        module: {
          id: '1',
          name: 'Онлайн-лекция',
          courseUrl: 'https://sdo.tusur.ru/course/view.php?id=22413',
          activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=1',
          type: 'lecture',
        },
      };
      const callTool = vi
        .fn()
        .mockResolvedValue(textResult(JSON.stringify(payload)));
      const client = clientWith(callTool);

      await expect(
        client.resolveOnlineLecture({
          courseUrl: 'https://sdo.tusur.ru/course/view.php?id=22413',
        }),
      ).resolves.toEqual(payload);
    });

    it('throws when the tool returns no text content', async () => {
      const callTool = vi.fn().mockResolvedValue({ content: [] });
      const client = clientWith(callTool);

      await expect(
        client.resolveOnlineLecture({ courseQuery: 'РМП2' }),
      ).rejects.toThrow('Empty resolve_online_lecture response');
    });

    it('throws when the tool reports an error', async () => {
      const callTool = vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: 'SDO page unavailable' }],
      });
      const client = clientWith(callTool);

      await expect(
        client.resolveOnlineLecture({ courseQuery: 'РМП2' }),
      ).rejects.toThrow('resolve_online_lecture failed: SDO page unavailable');
    });

    it('throws when the text content is not valid JSON', async () => {
      const callTool = vi
        .fn()
        .mockResolvedValue(textResult('<html>not json</html>'));
      const client = clientWith(callTool);

      await expect(
        client.resolveOnlineLecture({ courseQuery: 'РМП2' }),
      ).rejects.toThrow('Invalid resolve_online_lecture response');
    });
  });
});
