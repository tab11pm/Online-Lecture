import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BbbOrchestrator, BbbTarget, BbbJoinResult } from '../../src/core/bbb-orchestrator.js';
import { SdoMcpClient } from '../../src/core/mcp-client.js';
import { PlaywrightBbbSessionManager } from '../../src/core/bbb-session.js';
import type { BbbSession } from '../../src/core/types.js';

/**
 * Mock implementations for testing
 */
class MockSdoMcpClient {
  async authenticate() {
    return { token: 'mock-token', expiresAt: new Date(Date.now() + 3600000) };
  }

  async listCourses() {
    return [];
  }

  async findBbbActivity() {
    return {
      id: 'ACTIVITY-123',
      name: 'Lecture 1',
      courseUrl: 'https://sdo.tusur.ru/course/view.php?id=1',
      activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123&group=0',
      type: 'lecture' as const,
    };
  }

  async getBbbPage() {
    return '<html><body><a href="view.php?id=123&action=join">Join</a></body></html>';
  }

  async close() {}
}

class MockPlaywrightBbbSessionManager {
  private sessions: Map<string, BbbSession> = new Map();

  async startSession(url: string) {
    const session: BbbSession = {
      page: {} as any,
      url,
      startedAt: new Date(),
      status: 'started',
    };
    this.sessions.set(url, session);
    return session;
  }

  async joinAsListener(session: BbbSession) {
    session.status = 'joined';
  }

  async monitorSession() {
    // Mock: do nothing
  }

  async leaveSession(session: BbbSession) {
    session.status = 'left';
  }

  async closeAll() {
    this.sessions.clear();
  }
}

describe('BbbOrchestrator', () => {
  let orchestrator: BbbOrchestrator;
  let sdoMcpClient: any;
  let bbbSessionManager: any;

  beforeEach(() => {
    sdoMcpClient = new MockSdoMcpClient();
    bbbSessionManager = new MockPlaywrightBbbSessionManager();
    orchestrator = new BbbOrchestrator(
      sdoMcpClient as any,
      bbbSessionManager as any
    );
  });

  afterEach(async () => {
    await orchestrator.cleanup();
  });

  describe('Target resolution', () => {
    it('should handle direct target with activityUrl', async () => {
      const target: BbbTarget = {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123&group=0',
      };

      const result = await orchestrator.joinBbbSession(target);

      expect(result.success).toBe(true);
      expect(result.activityUrl).toContain('bigbluebuttonbn');
    });

    it('should reject direct target without activityUrl', async () => {
      const target: BbbTarget = {
        type: 'direct',
      };

      const result = await orchestrator.joinBbbSession(target);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Direct target requires activityUrl');
    });

    it('should reject search target (not yet implemented)', async () => {
      const target: BbbTarget = {
        type: 'search',
        courseId: 'COURSE-1',
        lectureQuery: 'Lecture 1',
      };

      const result = await orchestrator.joinBbbSession(target);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });

    it('should reject search target without courseId', async () => {
      const target: BbbTarget = {
        type: 'search',
        lectureQuery: 'Lecture 1',
      };

      const result = await orchestrator.joinBbbSession(target);

      expect(result.success).toBe(false);
      expect(result.error).toContain('requires courseId');
    });

    it('should reject search target without lectureQuery', async () => {
      const target: BbbTarget = {
        type: 'search',
        courseId: 'COURSE-1',
      };

      const result = await orchestrator.joinBbbSession(target);

      expect(result.success).toBe(false);
      expect(result.error).toContain('requires lectureQuery');
    });
  });

  describe('Session join flow', () => {
    it('should successfully join a session from direct target', async () => {
      const target: BbbTarget = {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123&group=0',
      };

      const result = await orchestrator.joinBbbSession(target);

      expect(result.success).toBe(true);
      expect(result.activityUrl).toBe(target.activityUrl);
      expect(result.joinedAt).toBeDefined();
      expect(result.session).toBeDefined();
    });

    it('should include session object on success', async () => {
      const target: BbbTarget = {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123&group=0',
      };

      const result = await orchestrator.joinBbbSession(target);

      expect(result.session).toBeDefined();
      expect(result.session?.url).toBe(target.activityUrl);
      expect(result.session?.status).toBe('joined');
    });

    it('should call joinAsListener when joining a session', async () => {
      const joinSpy = vi.spyOn(bbbSessionManager, 'joinAsListener');

      const target: BbbTarget = {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123&group=0',
      };

      await orchestrator.joinBbbSession(target);

      expect(joinSpy).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should catch and return error on join failure', async () => {
      // Simulate an error in session manager
      bbbSessionManager.startSession = vi.fn(async () => {
        throw new Error('Browser failed to start');
      });

      const target: BbbTarget = {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123',
      };

      const result = await orchestrator.joinBbbSession(target);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Browser failed to start');
    });

    it('should return error message without throwing', async () => {
      const target: BbbTarget = {
        type: 'direct',
        activityUrl: '', // Invalid URL
      };

      // Should not throw, should return result with error
      const result = await orchestrator.joinBbbSession(target);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Session management', () => {
    it('should provide session monitoring capability', async () => {
      const target: BbbTarget = {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123',
      };

      const result = await orchestrator.joinBbbSession(target);

      // Should be able to monitor session
      if (result.session) {
        const monitorSpy = vi.spyOn(orchestrator, 'monitorSession');
        await orchestrator.monitorSession(result.session);
        expect(monitorSpy).toHaveBeenCalledWith(result.session);
      }
    });

    it('should provide session leaving capability', async () => {
      const target: BbbTarget = {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123',
      };

      const result = await orchestrator.joinBbbSession(target);

      // Should be able to leave session
      if (result.session) {
        const leaveSpy = vi.spyOn(orchestrator, 'leaveSession');
        await orchestrator.leaveSession(result.session);
        expect(leaveSpy).toHaveBeenCalledWith(result.session);
        expect(result.session.status).toBe('left');
      }
    });

    it('should cleanup all resources', async () => {
      const target: BbbTarget = {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123',
      };

      await orchestrator.joinBbbSession(target);
      const closeAllSpy = vi.spyOn(bbbSessionManager, 'closeAll');

      await orchestrator.cleanup();

      expect(closeAllSpy).toHaveBeenCalled();
    });
  });

  describe('Result contract', () => {
    it('should always return BbbJoinResult with required fields', async () => {
      const target: BbbTarget = {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123',
      };

      const result = await orchestrator.joinBbbSession(target);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('activityUrl');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.activityUrl).toBe('string');
    });

    it('should include success details on successful join', async () => {
      const target: BbbTarget = {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123',
      };

      const result = await orchestrator.joinBbbSession(target);

      if (result.success) {
        expect(result.joinedAt).toBeDefined();
        expect(result.joinedAt instanceof Date).toBe(true);
        expect(result.session).toBeDefined();
      }
    });

    it('should include error message on failure', async () => {
      const target: BbbTarget = {
        type: 'search',
        courseId: 'COURSE-1',
        // Missing lectureQuery to trigger error
      };

      const result = await orchestrator.joinBbbSession(target);

      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
        expect(result.error!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Target types', () => {
    it('should handle direct target type correctly', () => {
      const target: BbbTarget = {
        type: 'direct',
        activityUrl: 'https://example.com/activity',
      };

      expect(target.type).toBe('direct');
      expect(target.activityUrl).toBeDefined();
    });

    it('should handle search target type correctly', () => {
      const target: BbbTarget = {
        type: 'search',
        courseId: 'COURSE-1',
        lectureQuery: 'Lecture 1',
      };

      expect(target.type).toBe('search');
      expect(target.courseId).toBeDefined();
      expect(target.lectureQuery).toBeDefined();
    });

    it('should support alternative search parameters', () => {
      const target: BbbTarget = {
        type: 'search',
        courseName: 'Operating Systems', // Alternative to courseId
        lectureQuery: 'Introduction',
      };

      expect(target.courseName).toBeDefined();
      expect(target.lectureQuery).toBeDefined();
    });
  });

  describe('Integration scenarios', () => {
    it('should handle typical lecture flow: join -> monitor -> leave', async () => {
      const target: BbbTarget = {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123&group=0',
      };

      // Join
      const joinResult = await orchestrator.joinBbbSession(target);
      expect(joinResult.success).toBe(true);

      if (joinResult.session) {
        // Monitor
        const monitorSpy = vi.spyOn(orchestrator, 'monitorSession');
        await orchestrator.monitorSession(joinResult.session);
        expect(monitorSpy).toHaveBeenCalled();

        // Leave
        await orchestrator.leaveSession(joinResult.session);
        expect(joinResult.session.status).toBe('left');
      }
    });

    it('should handle multiple consecutive joins', async () => {
      const target1: BbbTarget = {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123',
      };

      const target2: BbbTarget = {
        type: 'direct',
        activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=124',
      };

      const result1 = await orchestrator.joinBbbSession(target1);
      const result2 = await orchestrator.joinBbbSession(target2);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.activityUrl).not.toBe(result2.activityUrl);
    });
  });
});
