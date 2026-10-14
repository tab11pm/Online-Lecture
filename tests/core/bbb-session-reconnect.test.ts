import { describe, expect, it, vi } from 'vitest';
import {
  PlaywrightBbbSessionManager,
  UnsupportedBbbObservationError,
} from '../../src/core/bbb-session.js';
import type { BbbSession } from '../../src/core/types.js';

function setup() {
  const page = {
    reload: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    addInitScript: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(true),
  };
  const session: BbbSession = {
    page,
    status: 'joined',
    url: 'https://bbb2.tusur.ru/test',
    startedAt: new Date(),
  };
  return {
    page,
    session,
    manager: new PlaywrightBbbSessionManager(),
    abort: new AbortController(),
  };
}

describe('BBB reconnect', () => {
  it('reloads, rejoins as listener and returns the positive observation', async () => {
    const { page, session, manager, abort } = setup();
    expect(await manager.reconnect(session, abort.signal)).toEqual({
      kind: 'connected',
    });
    expect(page.reload).toHaveBeenCalledWith({ waitUntil: 'networkidle' });
    expect(page.click).toHaveBeenCalledWith('button:has-text("Listen Only")');
    expect(session.status).toBe('joined');
  });

  it('does not reload after cancellation', async () => {
    const { page, session, manager, abort } = setup();
    abort.abort();
    await expect(manager.reconnect(session, abort.signal)).rejects.toThrow();
    expect(page.reload).not.toHaveBeenCalled();
  });

  it('does not rejoin when cancellation happens during reload', async () => {
    const { page, session, manager, abort } = setup();
    page.reload.mockImplementation(async () => {
      abort.abort();
    });
    await expect(manager.reconnect(session, abort.signal)).rejects.toThrow();
    expect(page.click).not.toHaveBeenCalled();
  });

  it('returns a redacted network error when reload fails', async () => {
    const { page, session, manager, abort } = setup();
    page.reload.mockRejectedValue(new Error('offline sessionToken=secret'));
    const observation = await manager.reconnect(session, abort.signal);
    expect(observation).toMatchObject({ kind: 'network_error' });
    expect(JSON.stringify(observation)).not.toContain('secret');
    expect(page.click).not.toHaveBeenCalled();
  });

  it('preserves explicit unsupported observation failure after rejoining', async () => {
    const { page, session, manager, abort } = setup();
    page.evaluate.mockResolvedValue(false);
    await expect(
      manager.reconnect(session, abort.signal),
    ).rejects.toBeInstanceOf(UnsupportedBbbObservationError);
  });
});
