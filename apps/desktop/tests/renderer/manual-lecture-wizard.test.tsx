// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManualTargetLookup } from '../../src/shared/lectures.js';

const api = vi.hoisted(() => ({
  resolveManualTarget: vi.fn(),
  saveManual: vi.fn(async () => undefined),
}));
vi.mock('../../src/renderer/src/api', () => ({ desktop: { lectures: api } }));
import { ManualLectureWizard } from '../../src/renderer/src/components/ManualLectureWizard';

beforeEach(() => {
  api.resolveManualTarget.mockReset();
  api.saveManual.mockClear();
});
afterEach(cleanup);

describe('ManualLectureWizard', () => {
  it('keeps the course search field and action in one aligned control row', () => {
    render(<ManualLectureWizard onClose={vi.fn()} />);
    expect(
      screen
        .getByLabelText('Курс СДО или ссылка на курс')
        .closest('.wizard-search__field'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Найти активность' }),
    ).toHaveClass('wizard-search__button');
  });

  it('keeps the query after not_found and offers sign-in after auth_required', async () => {
    const onAuthRequired = vi.fn();
    api.resolveManualTarget
      .mockResolvedValueOnce({ status: 'not_found' })
      .mockResolvedValueOnce({ status: 'auth_required' });
    render(
      <ManualLectureWizard onClose={vi.fn()} onAuthRequired={onAuthRequired} />,
    );
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
    api.resolveManualTarget.mockResolvedValue({
      status: 'ambiguous',
      candidates: [
        { id: 'a', name: 'Лекция 1', type: 'lecture', courseName: 'Алгебра' },
        {
          id: 'b',
          name: 'Практика 1',
          type: 'practical',
          courseName: 'Алгебра',
        },
      ],
    });
    render(<ManualLectureWizard onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Курс СДО или ссылка на курс'), {
      target: { value: 'Алгебра' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Найти активность' }));
    const candidates = await screen.findByRole('group', {
      name: 'Выберите BBB-активность',
    });
    expect(within(candidates).getAllByRole('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Лекция 1/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: /Практика 1/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('disables save while a confirmed lecture is being written', async () => {
    api.resolveManualTarget.mockResolvedValue({
      status: 'resolved',
      candidates: [
        { id: 'a', name: 'Лекция 1', type: 'lecture', courseName: 'Алгебра' },
      ],
    });
    let finish!: () => void;
    api.saveManual.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<ManualLectureWizard onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Курс СДО или ссылка на курс'), {
      target: { value: 'Алгебра' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Найти активность' }));
    fireEvent.click(await screen.findByRole('button', { name: /Лекция 1/ }));
    fireEvent.change(screen.getByLabelText('Дата'), {
      target: { value: '20.10.2099' },
    });
    fireEvent.change(screen.getByLabelText('Вход'), {
      target: { value: '12:00' },
    });
    fireEvent.change(screen.getByLabelText('Выход'), {
      target: { value: '13:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить пару' }));
    expect(screen.getByRole('button', { name: 'Сохранение…' })).toBeDisabled();
    expect(api.saveManual).toHaveBeenCalledOnce();
    finish();
  });

  it('requires a selected BBB activity before saving a once lecture', async () => {
    api.resolveManualTarget.mockResolvedValue({
      status: 'resolved',
      candidates: [
        {
          id: 'opaque',
          name: 'Лекция 1',
          type: 'lecture',
          courseName: 'Алгебра',
        },
      ],
    });
    render(<ManualLectureWizard onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Курс СДО или ссылка на курс'), {
      target: { value: 'Алгебра' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Найти активность' }));
    expect(
      await screen.findByRole('button', { name: /Лекция 1/ }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText('Дата'), {
      target: { value: '20.10.2099' },
    });
    fireEvent.change(screen.getByLabelText('Вход'), {
      target: { value: '12:00' },
    });
    fireEvent.change(screen.getByLabelText('Выход'), {
      target: { value: '13:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить пару' }));
    expect(api.saveManual).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Лекция 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить пару' }));
    await waitFor(() =>
      expect(api.saveManual).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateId: 'opaque',
          schedule: {
            type: 'once',
            date: '2099-10-20',
            joinAt: '12:00',
            leaveAt: '13:00',
          },
        }),
      ),
    );
  });

  it('requires at least one weekday for a weekly pair', async () => {
    api.resolveManualTarget.mockResolvedValue({ status: 'not_found' });
    render(<ManualLectureWizard onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Еженедельно'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить пару' }));
    expect(
      screen.getByText('Выберите хотя бы один день недели.'),
    ).toBeVisible();
  });

  it('saves a weekly schedule with selected weekdays and normalized clock values', async () => {
    api.resolveManualTarget.mockResolvedValue({
      status: 'resolved',
      candidates: [
        { id: 'a', name: 'Лекция 1', type: 'lecture', courseName: 'Алгебра' },
      ],
    });
    render(<ManualLectureWizard onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Курс СДО или ссылка на курс'), {
      target: { value: 'Алгебра' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Найти активность' }));
    fireEvent.click(await screen.findByRole('button', { name: /Лекция 1/ }));
    fireEvent.click(screen.getByLabelText('Еженедельно'));
    fireEvent.click(screen.getByRole('button', { name: 'Пн' }));
    fireEvent.change(screen.getByLabelText('Вход'), {
      target: { value: ' 09:00 ' },
    });
    fireEvent.change(screen.getByLabelText('Выход'), {
      target: { value: '10:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить пару' }));
    await waitFor(() =>
      expect(api.saveManual).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateId: 'a',
          schedule: {
            type: 'weekly',
            days: ['mon'],
            joinAt: '09:00',
            leaveAt: '10:30',
          },
        }),
      ),
    );
  });

  it('keeps an in-flight search usable after the query changes and ignores stale results', async () => {
    let finishOld!: (value: ManualTargetLookup) => void;
    api.resolveManualTarget
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce({
        status: 'resolved',
        candidates: [
          {
            id: 'new',
            name: 'Новый результат',
            type: 'lecture',
            courseName: 'Новый курс',
          },
        ],
      });
    render(<ManualLectureWizard onClose={vi.fn()} />);
    const query = screen.getByLabelText('Курс СДО или ссылка на курс');
    fireEvent.change(query, { target: { value: 'Старый запрос' } });
    fireEvent.click(screen.getByRole('button', { name: 'Найти активность' }));
    expect(screen.getByRole('button', { name: 'Поиск…' })).toBeDisabled();
    fireEvent.change(query, { target: { value: 'Новый запрос' } });
    expect(
      screen.getByRole('button', { name: 'Найти активность' }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Найти активность' }));
    expect(
      await screen.findByRole('button', { name: /Новый результат/ }),
    ).toBeVisible();
    finishOld({
      status: 'resolved',
      candidates: [
        {
          id: 'old',
          name: 'Старый результат',
          type: 'lecture',
          courseName: 'Старый курс',
        },
      ],
    });
    await waitFor(() =>
      expect(screen.queryByText('Старый результат')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Новый результат')).toBeVisible();
  });

  it('rejects an impossible displayed date and invalid 24-hour times', async () => {
    api.resolveManualTarget.mockResolvedValue({
      status: 'resolved',
      candidates: [
        { id: 'a', name: 'Лекция 1', type: 'lecture', courseName: 'Алгебра' },
      ],
    });
    render(<ManualLectureWizard onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Курс СДО или ссылка на курс'), {
      target: { value: 'Алгебра' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Найти активность' }));
    fireEvent.click(await screen.findByRole('button', { name: /Лекция 1/ }));
    fireEvent.change(screen.getByLabelText('Дата'), {
      target: { value: '31.02.2028' },
    });
    fireEvent.change(screen.getByLabelText('Вход'), {
      target: { value: '25:00' },
    });
    fireEvent.change(screen.getByLabelText('Выход'), {
      target: { value: '26:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить пару' }));
    expect(screen.getByLabelText('Дата')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('Вход')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(api.saveManual).not.toHaveBeenCalled();
  });
});
