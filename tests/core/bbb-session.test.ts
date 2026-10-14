import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import type { BbbSession, SessionConfig } from '../../src/core/types.js';
import { chromium } from 'playwright';

// Mock Playwright first, before any imports
vi.mock('../../src/core/browser-launch.js', () => ({
  assertBrowserAvailable: vi.fn().mockResolvedValue(undefined),
}));
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

  describe('observe', () => {
    function sessionWithDom(html: string): BbbSession {
      const dom = new JSDOM(html, { runScripts: 'outside-only' });
      return {
        page: {
          evaluate: vi.fn(async (callback: () => unknown) => {
            try {
              return dom.window.eval(`(${callback.toString()})()`);
            } finally {
              dom.window.close();
            }
          }),
        },
        status: 'joined',
        url: 'https://bbb2.tusur.ru/test',
        startedAt: new Date(),
      };
    }

    it('reports connected from the maintained audio indicator fixture without leaving', async () => {
      const html = readFileSync(
        new URL('../fixtures/bbb-lifecycle/connected.html', import.meta.url),
        'utf8',
      );
      const session = sessionWithDom(html);
      const leave = vi.spyOn(manager, 'leaveSession');

      await expect(
        manager.observe(session, new AbortController().signal),
      ).resolves.toEqual({ kind: 'connected' });
      expect(session.status).toBe('joined');
      expect(leave).not.toHaveBeenCalled();
    });

    it.each([
      '<main></main>',
      '<main>Disconnected</main>',
      '<button data-testid="leave-button">Leave</button>',
    ])(
      'rejects unrecognized DOM without inferring a terminal event: %s',
      async (html) => {
        await expect(
          manager.observe(sessionWithDom(html), new AbortController().signal),
        ).rejects.toMatchObject({ name: 'UnsupportedBbbObservationError' });
      },
    );

    it('respects cancellation before accessing the page', async () => {
      const abort = new AbortController();
      abort.abort();
      const session = sessionWithDom('<main></main>');

      await expect(
        manager.observe(session, abort.signal),
      ).rejects.toMatchObject({
        name: 'AbortError',
      });
      expect(session.page.evaluate).not.toHaveBeenCalled();
    });

    it('returns a redacted network error when page evaluation fails', async () => {
      const session = sessionWithDom('<main></main>');
      session.page.evaluate.mockRejectedValue(
        new Error(
          'Navigation failed https://bbb2.tusur.ru/join?sessionToken=secret',
        ),
      );

      await expect(
        manager.observe(session, new AbortController().signal),
      ).resolves.toEqual({
        kind: 'network_error',
        message: 'Navigation failed [REDACTED_URL]',
      });
      expect(session.status).toBe('joined');
    });

    it('preserves cancellation during evaluation instead of reporting a network error', async () => {
      const abort = new AbortController();
      const session = sessionWithDom('<main></main>');
      session.page.evaluate.mockImplementation(async () => {
        abort.abort();
        throw new Error('Page closed');
      });

      await expect(
        manager.observe(session, abort.signal),
      ).rejects.toMatchObject({
        name: 'AbortError',
      });
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
