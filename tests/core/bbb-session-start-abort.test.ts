import { beforeEach, describe, expect, it, vi } from 'vitest';

const doubles = vi.hoisted(() => {
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { page, browser, launch: vi.fn().mockResolvedValue(browser) };
});
vi.mock('../../src/core/browser-launch.js', () => ({
  assertBrowserAvailable: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('playwright', () => ({ chromium: { launch: doubles.launch } }));
import { PlaywrightBbbSessionManager } from '../../src/core/bbb-session.js';
import { JobRunner } from '../../src/core/job-runner.js';
import { transitionRun } from '../../src/core/lifecycle.js';
import type { Job, Run, RunRepository } from '../../src/core/types.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('BBB startup abort cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    doubles.launch.mockReset();
    doubles.browser.newPage.mockReset();
    doubles.page.goto.mockReset();
    doubles.launch.mockResolvedValue(doubles.browser);
    doubles.browser.newPage.mockResolvedValue(doubles.page);
    doubles.page.goto.mockResolvedValue(undefined);
  });

  it('closes a browser created after abort during launch', async () => {
    const launch = deferred<typeof doubles.browser>();
    doubles.launch.mockReturnValueOnce(launch.promise);
    const manager = new PlaywrightBbbSessionManager();
    const abort = new AbortController();
    const startup = manager.startSession(
      'https://bbb2.tusur.ru/test',
      { headless: true },
      abort.signal,
    );
    await vi.waitFor(() => expect(doubles.launch).toHaveBeenCalled());
    abort.abort();
    await expect(startup).rejects.toThrow();
    launch.resolve(doubles.browser);
    expect(doubles.browser.newPage).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(doubles.browser.close).toHaveBeenCalledOnce(),
    );
  });

  it('settles promptly when launch never resolves after abort', async () => {
    doubles.launch.mockReturnValueOnce(new Promise(() => {}));
    const manager = new PlaywrightBbbSessionManager();
    const abort = new AbortController();
    const startup = manager.startSession(
      'https://bbb2.tusur.ru/test',
      { headless: true },
      abort.signal,
    );
    await vi.waitFor(() => expect(doubles.launch).toHaveBeenCalled());
    abort.abort();
    await expect(startup).rejects.toThrow();
    expect(doubles.browser.newPage).not.toHaveBeenCalled();
  });

  it('times out a launch that never resolves', async () => {
    doubles.launch.mockReturnValueOnce(new Promise(() => {}));
    const manager = new PlaywrightBbbSessionManager();
    await expect(
      manager.startSession('https://bbb2.tusur.ru/test', {
        headless: true,
        timeout: 5,
      }),
    ).rejects.toThrow('launch timeout');
    expect(doubles.browser.newPage).not.toHaveBeenCalled();
  });

  it('settles promptly and closes browser when newPage never resolves', async () => {
    doubles.browser.newPage.mockReturnValueOnce(new Promise(() => {}));
    const manager = new PlaywrightBbbSessionManager();
    const abort = new AbortController();
    const startup = manager.startSession(
      'https://bbb2.tusur.ru/test',
      { headless: true },
      abort.signal,
    );
    await vi.waitFor(() =>
      expect(doubles.browser.newPage).toHaveBeenCalledOnce(),
    );
    await vi.waitFor(() => expect(doubles.browser.newPage).toHaveBeenCalled());
    abort.abort();
    await expect(startup).rejects.toThrow();
    expect(doubles.browser.close).toHaveBeenCalledOnce();
    expect(doubles.page.goto).not.toHaveBeenCalled();
  });

  it('times out page creation and closes the already created browser', async () => {
    doubles.browser.newPage.mockReturnValueOnce(new Promise(() => {}));
    const manager = new PlaywrightBbbSessionManager();
    await expect(
      manager.startSession('https://bbb2.tusur.ru/test', {
        headless: true,
        timeout: 5,
      }),
    ).rejects.toThrow('page creation timeout');
    expect(doubles.browser.close).toHaveBeenCalledOnce();
  });

  it('settles and persists manual cancellation when a runner launch never resolves', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-29T14:30:00Z'));
    try {
      doubles.launch.mockReturnValueOnce(new Promise(() => {}));
      const manager = new PlaywrightBbbSessionManager();
      const joined = vi.spyOn(manager, 'joinAsListener');
      const job: Job = {
        id: 'job-1',
        enabled: true,
        schedule: {
          type: 'once',
          date: '2026-09-29',
          joinAt: '14:00',
          leaveAt: '15:00',
          timezone: 'UTC',
        },
        target: { type: 'direct', activityUrl: 'https://bbb2.tusur.ru/test' },
        browser: { headless: true },
      };
      let stored: Run | undefined;
      const repo: RunRepository = {
        getOrCreate: async (run) => {
          if (stored) return { run: stored, created: false };
          stored = run;
          return { run, created: true };
        },
        update: async (run) => {
          stored = run;
        },
        claimScheduled: async (_jobId, _occurrenceId, at) => {
          if (stored?.status !== 'scheduled') return undefined;
          stored = transitionRun(stored, 'resolving', at);
          return stored;
        },
        skipScheduled: async () => undefined,
      };
      const runner = new JobRunner(
        {} as any,
        manager,
        {
          getById: async () => job,
          listEnabled: async () => [job],
          save: async () => undefined,
        },
        repo,
      );
      const abort = new AbortController();
      const run = runner.runJob(
        'job-1',
        'job-1:2026-09-29T14:00:00.000Z',
        abort.signal,
      );
      await vi.waitFor(() => expect(doubles.launch).toHaveBeenCalledOnce());
      abort.abort();
      expect(await run).toMatchObject({
        status: 'completed',
        completionReason: 'manual',
      });
      expect(stored).toMatchObject({
        status: 'completed',
        completionReason: 'manual',
      });
      expect(joined).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes a page created after abort during newPage', async () => {
    const created = deferred<typeof doubles.page>();
    doubles.browser.newPage.mockReturnValueOnce(created.promise);
    const manager = new PlaywrightBbbSessionManager();
    const abort = new AbortController();
    const startup = manager.startSession(
      'https://bbb2.tusur.ru/test',
      { headless: true },
      abort.signal,
    );
    await vi.waitFor(() =>
      expect(doubles.browser.newPage).toHaveBeenCalledOnce(),
    );
    await vi.waitFor(() => expect(doubles.browser.newPage).toHaveBeenCalled());
    abort.abort();
    await expect(startup).rejects.toThrow();
    created.resolve(doubles.page);
    expect(doubles.page.goto).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(doubles.page.close).toHaveBeenCalledOnce());
    expect(doubles.browser.close).toHaveBeenCalledOnce();
  });

  it('closes page and browser while navigation remains pending', async () => {
    const navigation = deferred<void>();
    doubles.page.goto.mockReturnValueOnce(navigation.promise);
    const manager = new PlaywrightBbbSessionManager();
    const abort = new AbortController();
    const startup = manager.startSession(
      'https://bbb2.tusur.ru/test',
      { headless: true },
      abort.signal,
    );
    await vi.waitFor(() => expect(doubles.page.goto).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(doubles.page.goto).toHaveBeenCalled());
    abort.abort();
    await expect(startup).rejects.toThrow();
    expect(doubles.page.close).toHaveBeenCalledOnce();
    expect(doubles.browser.close).toHaveBeenCalledOnce();
    navigation.resolve();
  });
});
