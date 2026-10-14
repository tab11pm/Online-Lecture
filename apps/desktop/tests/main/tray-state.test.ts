import { describe, it, expect } from 'vitest';
import { trayStateFromView } from '../../src/main/tray-state.js';
import type { LecturesView } from '../../src/shared/lectures.js';

const empty: LecturesView = { agenda: [], import: { status: 'idle' } };

describe('trayStateFromView', () => {
  it('shows the running lecture with stop enabled', () => {
    const state = trayStateFromView({
      ...empty,
      current: {
        jobId: 'j',
        occurrenceId: 'o',
        title: 'Физика',
        leaveAt: '2026-10-15T11:30:00.000+07:00',
        status: 'running',
      },
    });
    expect(state).toEqual({
      status: 'Лекция: Физика до 11:30',
      tooltip: 'Online Lecture — Лекция: Физика до 11:30',
      canStop: true,
    });
  });

  it('shows the next lecture', () => {
    const state = trayStateFromView({
      ...empty,
      next: {
        jobId: 'j',
        occurrenceId: 'o',
        title: 'Химия',
        date: '2026-10-16',
        joinAt: '09:50',
        leaveAt: '11:30',
        skipped: false,
      },
    });
    expect(state).toEqual({
      status: 'Ближайшая: 16.10 09:50 Химия',
      tooltip: 'Online Lecture — Ближайшая: 16.10 09:50 Химия',
      canStop: false,
    });
  });

  it('shows no lectures', () => {
    expect(trayStateFromView(empty)).toEqual({
      status: 'Онлайн-пар нет',
      tooltip: 'Online Lecture — Онлайн-пар нет',
      canStop: false,
    });
  });
});
