// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ resolveManualTarget: vi.fn(), saveManual: vi.fn(async () => undefined) }));
vi.mock('../../src/renderer/src/api', () => ({ desktop: { lectures: api } }));
import { ManualLectureWizard } from '../../src/renderer/src/components/ManualLectureWizard';

beforeEach(() => {
  api.resolveManualTarget.mockReset();
  api.saveManual.mockClear();
});
afterEach(cleanup);

describe('ManualLectureWizard', () => {
  it('keeps the query after not_found and offers sign-in after auth_required', async () => {
    const onAuthRequired = vi.fn();
    api.resolveManualTarget.mockResolvedValueOnce({ status: 'not_found' }).mockResolvedValueOnce({ status: 'auth_required' });
    render(<ManualLectureWizard onClose={vi.fn()} onAuthRequired={onAuthRequired} />);
    const query = screen.getByLabelText('Курс СДО или ссылка на курс');
    fireEvent.change(query, { target: { value: 'Алгебра' } });
    fireEvent.click(screen.getByRole('button', { name: 'Найти активность' }));
    expect(await screen.findByText(/Активность не найдена/)).toBeVisible();
    expect(query).toHaveValue('Алгебра');
    fireEvent.click(screen.getByRole('button', { name: 'Найти активность' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Войти снова' }));
    expect(onAuthRequired).toHaveBeenCalledOnce();
  });

  it('shows ambiguous candidates and waits for explicit selection', async () => {
    api.resolveManualTarget.mockResolvedValue({ status: 'ambiguous', candidates: [{ id: 'a', name: 'Лекция 1', type: 'lecture', courseName: 'Алгебра' }, { id: 'b', name: 'Практика 1', type: 'practical', courseName: 'Алгебра' }] });
    render(<ManualLectureWizard onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Курс СДО или ссылка на курс'), { target: { value: 'Алгебра' } });
    fireEvent.click(screen.getByRole('button', { name: 'Найти активность' }));
    expect(await screen.findAllByRole('radio', { name: /Алгебра/ })).toHaveLength(2);
    expect(screen.getByRole('radio', { name: /Лекция 1/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Практика 1/ })).not.toBeChecked();
  });

  it('disables save while a confirmed lecture is being written', async () => {
    api.resolveManualTarget.mockResolvedValue({ status: 'resolved', candidates: [{ id: 'a', name: 'Лекция 1', type: 'lecture', courseName: 'Алгебра' }] });
    let finish!: () => void;
    api.saveManual.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<ManualLectureWizard onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Курс СДО или ссылка на курс'), { target: { value: 'Алгебра' } });
    fireEvent.click(screen.getByRole('button', { name: 'Найти активность' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Лекция 1/ }));
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2099-10-20' } });
    fireEvent.change(screen.getByLabelText('Вход'), { target: { value: '12:00' } });
    fireEvent.change(screen.getByLabelText('Выход'), { target: { value: '13:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить пару' }));
    expect(screen.getByRole('button', { name: 'Сохранение…' })).toBeDisabled();
    expect(api.saveManual).toHaveBeenCalledOnce();
    finish();
  });

  it('requires a selected BBB activity before saving a once lecture', async () => {
    api.resolveManualTarget.mockResolvedValue({ status: 'resolved', candidates: [{ id: 'opaque', name: 'Лекция 1', type: 'lecture', courseName: 'Алгебра' }] });
    render(<ManualLectureWizard onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Курс СДО или ссылка на курс'), { target: { value: 'Алгебра' } });
    fireEvent.click(screen.getByRole('button', { name: 'Найти активность' }));
    expect(await screen.findByRole('radio', { name: /Лекция 1/ })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2099-10-20' } });
    fireEvent.change(screen.getByLabelText('Вход'), { target: { value: '12:00' } });
    fireEvent.change(screen.getByLabelText('Выход'), { target: { value: '13:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить пару' }));
    expect(api.saveManual).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/Лекция 1/));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить пару' }));
    await waitFor(() => expect(api.saveManual).toHaveBeenCalledWith(expect.objectContaining({ candidateId: 'opaque', schedule: { type: 'once', date: '2099-10-20', joinAt: '12:00', leaveAt: '13:00' } })));
  });

  it('requires at least one weekday for a weekly pair', async () => {
    api.resolveManualTarget.mockResolvedValue({ status: 'not_found' });
    render(<ManualLectureWizard onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Еженедельно'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить пару' }));
    expect(screen.getByRole('alert')).toHaveTextContent('день');
  });
});
