// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgendaItem } from '../../src/shared/lectures.js';

const api = vi.hoisted(() => ({
  editImportedTime: vi.fn(async () => undefined),
  reschedule: vi.fn(async () => 'manual:2'),
  cancelReschedule: vi.fn(async () => undefined),
  deleteLecture: vi.fn(async () => undefined),
}));
vi.mock('../../src/renderer/src/api', () => ({ desktop: { lectures: api } }));
import { ScheduleEditor } from '../../src/renderer/src/components/ScheduleEditor';

afterEach(cleanup);
beforeEach(() => {
  api.editImportedTime.mockClear();
  api.reschedule.mockClear();
});
const item: AgendaItem = {
  jobId: 'tt:1',
  occurrenceId: 'tt:1:date',
  title: 'Алгебра',
  source: 'timetable',
  editable: true,
  date: '2026-10-20',
  joinAt: '12:00',
  leaveAt: '13:00',
  skipped: false,
};

describe('ScheduleEditor', () => {
  it('edits only the selected imported occurrence', async () => {
    render(<ScheduleEditor item={item} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Вход'), {
      target: { value: '12:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить время' }));
    await waitFor(() =>
      expect(api.editImportedTime).toHaveBeenCalledWith({
        jobId: 'tt:1',
        date: '2026-10-20',
        occurrenceId: 'tt:1:date',
        joinAt: '12:30',
        leaveAt: '13:00',
      }),
    );
  });

  it('moves to a new date and shows a field error for an invalid interval', async () => {
    render(<ScheduleEditor item={item} onClose={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Перенести на другую дату' }),
    );
    fireEvent.change(screen.getByLabelText('Новая дата'), {
      target: { value: '21.10.2026' },
    });
    fireEvent.change(screen.getByLabelText('Выход'), {
      target: { value: '11:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить перенос' }));
    expect(
      screen.getByText('Время выхода должно быть позже времени входа.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Выход')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('Выход')).toHaveAttribute(
      'aria-describedby',
      'edit-leave-error',
    );
    expect(api.reschedule).not.toHaveBeenCalled();
  });

  it('passes the selected occurrence when moving a pair', async () => {
    render(<ScheduleEditor item={item} onClose={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Перенести на другую дату' }),
    );
    fireEvent.change(screen.getByLabelText('Новая дата'), {
      target: { value: '21.10.2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить перенос' }));
    await waitFor(() =>
      expect(api.reschedule).toHaveBeenCalledWith({
        jobId: 'tt:1',
        date: '2026-10-20',
        occurrenceId: 'tt:1:date',
        newDate: '2026-10-21',
        newJoinAt: '12:00',
        newLeaveAt: '13:00',
      }),
    );
  });

  it('shows the original date in Russian format and rejects an impossible move date', () => {
    render(<ScheduleEditor item={item} initialMode="move" onClose={vi.fn()} />);
    expect(screen.getByText(/Исходная пара: 20\.10\.2026/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Новая дата'), {
      target: { value: '31.02.2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить перенос' }));
    expect(screen.getByLabelText('Новая дата')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(api.reschedule).not.toHaveBeenCalled();
  });
});
