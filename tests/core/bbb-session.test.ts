import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionConfig } from '../../src/core/types.js';
import { chromium } from 'playwright';

vi.mock('../../src/core/browser-launch.js', () => ({
  assertBrowserAvailable: vi.fn().mockResolvedValue(undefined),
}));

// Mock Playwright first, before any imports
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        goto: vi.fn().mockResolvedValue(null),
        click: vi.fn().mockResolvedValue(null),
        $: vi.fn().mockResolvedValue(null),
        waitForSelector: vi.fn().mockResolvedValue(null),
        waitForTimeout: vi.fn().mockResolvedValue(null),
        evaluate: vi.fn().mockResolvedValue('connected'),
        addInitScript: vi.fn().mockResolvedValue(null),
        close: vi.fn().mockResolvedValue(null),
        on: vi.fn(),
      }),
      close: vi.fn().mockResolvedValue(null),
    }),
  },
}));

// Now import the module under test
import { PlaywrightBbbSessionManager } from '../../src/core/bbb-session.js';

describe('PlaywrightBbbSessionManager', () => {
  let manager: PlaywrightBbbSessionManager;
  const mockConfig: SessionConfig = {
    headless: false,
    timeout: 30000,
    joinTimeout: 10000,
  };

  beforeEach(() => {
    manager = new PlaywrightBbbSessionManager();
  });

  describe('startSession', () => {
    it('uses Edge when requested by the caller', async () => {
      manager = new PlaywrightBbbSessionManager({ channel: 'msedge' });
      await manager.startSession(
        'https://bbb2.tusur.ru/meeting123',
        mockConfig,
      );
      expect(chromium.launch).toHaveBeenLastCalledWith({
        headless: false,
        channel: 'msedge',
      });
    });
    it('should start a browser session with valid URL', async () => {
      const url = 'https://bbb2.tusur.ru/meeting123';

      const session = await manager.startSession(url, mockConfig);

      expect(session).toBeDefined();
      expect(session.page).toBeDefined();
      expect(session.status).toBe('started');
      expect(session.url).toBe(url);
    });

    it('should throw on invalid URL', async () => {
      const invalidUrl = 'not-a-url';

      await expect(
        manager.startSession(invalidUrl, mockConfig),
      ).rejects.toThrow('Invalid URL');
    });
  });

  describe('joinAsListener', () => {
    it('should join session as listener', async () => {
      const url = 'https://bbb2.tusur.ru/meeting123';
      const session = await manager.startSession(url, mockConfig);

      await manager.joinAsListener(session);

      expect(session.status).toBe('joined');
    });

    it('should throw if session not started', async () => {
      const session = {
        page: {
          click: vi.fn(),
          waitForSelector: vi.fn(),
          addInitScript: vi.fn(),
        },
        status: 'starting' as const,
        url: 'https://bbb2.tusur.ru/test',
        startedAt: new Date(),
      };

      await expect(manager.joinAsListener(session)).rejects.toThrow(
        'Cannot join',
      );
    });
  });

  describe('monitorSession', () => {
    it('should monitor session state', async () => {
      const url = 'https://bbb2.tusur.ru/meeting123';
      const session = await manager.startSession(url, mockConfig);
      await manager.joinAsListener(session);

      const state = await manager.monitorSession(session);

      expect(state).toBeDefined();
      expect(state.isConnected).toBe(true);
      expect(state.isAudioEnabled).toBe(true);
      expect(state.isVideoEnabled).toBe(false);
      expect(state.meetingStatus).toBe('connected');
    });
  });

  describe('leaveSession', () => {
    it('should leave session and close browser', async () => {
      const url = 'https://bbb2.tusur.ru/meeting123';
      const session = await manager.startSession(url, mockConfig);
      await manager.joinAsListener(session);

      await manager.leaveSession(session);

      expect(session.status).toBe('left');
    });
  });

  describe('closeAll', () => {
    it('should close all open sessions', async () => {
      const url1 = 'https://bbb2.tusur.ru/meeting1';
      const url2 = 'https://bbb2.tusur.ru/meeting2';

      const session1 = await manager.startSession(url1, mockConfig);
      const session2 = await manager.startSession(url2, mockConfig);

      await manager.joinAsListener(session1);
      await manager.joinAsListener(session2);

      await manager.closeAll();

      expect(session1.status).toBe('left');
      expect(session2.status).toBe('left');
    });
  });
});
