import { describe, expect, it, vi } from 'vitest';
import { DesktopNotifier } from '../../src/main/desktop-notifier.js';

function setup(throwOnShow = false) {
  const notifications: Array<{
    title: string;
    body: string;
    click?: () => void;
  }> = [];
  const onOpen = vi.fn();
  const notifier = new DesktopNotifier((options) => {
    const item: { title: string; body: string; click?: () => void } = {
      ...options,
    };
    notifications.push(item);
    return {
      show: () => {
        if (throwOnShow) throw new Error('notifications unavailable');
      },
      on: (_event: 'click', listener: () => void) => {
        item.click = listener;
      },
    };
  }, onOpen);
  return { notifier, notifications, onOpen };
}

describe('DesktopNotifier', () => {
  it('shows one toast for a repeated event ID with a fixed safe message', () => {
    const { notifier, notifications } = setup();
    const event = {
      id: 7,
      code: 'retries_exhausted' as const,
      title: 'Алгебра https://bbb2.tusur.ru/b/?sessionToken=secret',
      status: 'failed' as const,
    };

    notifier.show(event);
    notifier.show(event);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.body).toContain('Алгебра');
    expect(JSON.stringify(notifications)).not.toMatch(
      /bbb2\.tusur|secret|sessionToken=/,
    );
  });

  it('continues when the operating system cannot show a notification', () => {
    const { notifier } = setup(true);

    expect(() =>
      notifier.show({ id: 8, code: 'core_error', title: 'Приложение' }),
    ).not.toThrow();
  });

  it('opens the journal when a toast is clicked', () => {
    const { notifier, notifications, onOpen } = setup();
    notifier.show({ id: 9, code: 'auth_required', title: 'Приложение' });

    notifications[0]?.click?.();

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('uses distinct outcomes for completed, blocked and failed runs', () => {
    const { notifier, notifications } = setup();
    notifier.show({
      id: 1,
      code: 'lecture_finished',
      title: 'Алгебра',
      status: 'completed',
    });
    notifier.show({
      id: 2,
      code: 'lecture_finished',
      title: 'Алгебра',
      status: 'blocked',
    });
    notifier.show({
      id: 3,
      code: 'lecture_finished',
      title: 'Алгебра',
      status: 'failed',
    });

    expect(new Set(notifications.map((item) => item.body)).size).toBe(3);
  });
});
