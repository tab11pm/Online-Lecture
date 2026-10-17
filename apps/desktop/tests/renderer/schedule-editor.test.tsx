// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgendaItem } from '../../src/shared/lectures.js';

const api = vi.hoisted(() => ({ editImportedTime: vi.fn(async () => undefined), reschedule: vi.fn(async () => 'manual:2'), cancelReschedule: vi.fn(async () => undefined), deleteLecture: vi.fn(async () => undefined) }));
vi.mock('../../src/renderer/src/api', () => ({ desktop: { lectures: api } }));
import { ScheduleEditor } from '../../src/renderer/src/components/ScheduleEditor';

afterEach(cleanup);
const item: AgendaItem = { jobId: 'tt:1', occurrenceId: 'tt:1:date', title: 'Алгебра', source: 'timetable', editable: true, date: '2026-10-20', joinAt: '12:00', leaveAt: '13:00', skipped: false };

describe('ScheduleEditor', () => {
  it('edits only the selected imported occurrence', async () => {
    render(<ScheduleEditor item={item} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Вход'), { target: { value: '12:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить время' }));
    await waitFor(() => expect(api.editImportedTime).toHaveBeenCalledWith({ jobId: 'tt:1', date: '2026-10-20', joinAt: '12:30', leaveAt: '13:00' }));
  });

  it('moves to a new date and shows a field error for an invalid interval', async () => {
    render(<ScheduleEditor item={item} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Перенести на другую дату' }));
    fireEvent.change(screen.getByLabelText('Новая дата'), { target: { value: '2026-10-21' } });
    fireEvent.change(screen.getByLabelText('Выход'), { target: { value: '11:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить перенос' }));
    expect(screen.getByRole('alert')).toHaveTextContent('позже');
    expect(api.reschedule).not.toHaveBeenCalled();
  });
});
