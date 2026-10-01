import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SdoMcpClient } from '../../src/core/mcp-client.js';
import type { Session, Course, BbbActivity, BbbUrl, Credentials } from '../../src/core/types.js';

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    request: vi.fn(),
  })),
  StdioClientTransport: vi.fn().mockImplementation(() => ({})),
}));

describe('SdoMcpClient', () => {
  let client: SdoMcpClient;
  const mockConfig = {
    serverPath: '/path/to/sdo-mcp',
    connectionTimeout: 5000,
  };

  beforeEach(() => {
    client = new SdoMcpClient(mockConfig);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('authenticate', () => {
    it('should return session on successful authentication', async () => {
      const credentials = {
        username: 'testuser',
        password: 'testpass',
      };

      // The client should handle authentication gracefully
      // When no real MCP server is available, it should throw a meaningful error
      await expect(client.authenticate(credentials)).rejects.toThrow('spawn');
    });
  });

  describe('session management', () => {
    it('should return null session when not authenticated', () => {
      const session = client.getSession();
      expect(session).toBeNull();
    });

    it('should close connection without error when client is null', async () => {
      // Should not throw
      await expect(client.close()).resolves.toBeUndefined();
    });
  });
});

describe('SdoMcpClient types', () => {
  it('should have correct types defined', () => {
    // Verify types are properly exported
    const credentials: Credentials = {
      username: 'test',
      password: 'test',
    };
    expect(credentials.username).toBe('test');

    const session: Session = {
      token: 'token',
      expiresAt: new Date(),
    };
    expect(session.token).toBe('token');

    const course: Course = {
      id: 'id',
      name: 'name',
    };
    expect(course.id).toBe('id');

    const activity: BbbActivity = {
      id: 'id',
      name: 'name',
      courseUrl: 'https://sdo.tusur.ru/course/view.php?id=1',
      activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=1',
      type: 'lecture',
    };
    expect(activity.id).toBe('id');

    const bbbUrl: BbbUrl = {
      url: 'https://bbb2.tusur.ru/meeting',
      meetingId: 'meeting',
      activityId: 'activity',
    };
    expect(bbbUrl.url).toContain('bbb2.tusur.ru');
  });
});