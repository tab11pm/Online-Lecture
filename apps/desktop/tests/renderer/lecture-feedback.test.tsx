// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LecturesView } from '../../src/shared/lectures.js';
import { ImportPanel } from '../../src/renderer/src/components/ImportPanel';
import { LectureStatus } from '../../src/renderer/src/components/LectureStatus';

afterEach(cleanup);

describe('lecture feedback', () => {
  it('prevents repeated import requests before the worker broadcasts progress and allows retry', async () => {
    let finish!: () => void;
    const onImport = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error('Нет связи с ядром'));
    render(<ImportPanel view={{ status: 'idle' }} onImport={onImport} />);
    const button = screen.getByRole('button', { name: 'Обновить расписание' });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onImport).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нет связи с ядром',
    );
    expect(
      screen.getByRole('button', { name: /Повторить обновление/ }),
    ).toBeEnabled();
  });

  it('keeps the last successful update visible during import failure', () => {
    render(
      <ImportPanel
        view={{
          status: 'failed',
          at: '2026-10-19T11:00:00+07:00',
          lastSuccessAt: '2026-10-19T09:41:00+07:00',
          message: 'Нет связи с расписанием',
        }}
        onImport={vi.fn()}
      />,
    );
    expect(screen.getByText(/Обновлено:/)).toHaveTextContent('19.10.2026');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Нет связи с расписанием',
    );
    expect(
      screen.getByText(/Сохранённое расписание остаётся доступным/),
    ).toBeVisible();
  });

  it('does not promise a saved schedule after the first import fails', () => {
    render(
      <ImportPanel
        view={{
          status: 'failed',
          at: '2026-10-19T11:00:00+07:00',
          message: 'Не удалось загрузить расписание',
        }}
        onImport={vi.fn()}
      />,
    );
    expect(
      screen.queryByText(/Сохранённое расписание остаётся доступным/),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/добавьте пару вручную/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Повторить обновление' }),
    ).toBeEnabled();
  });

  it('does not label an incomplete import as a full success even without unresolved courses', () => {
    render(
      <ImportPanel
        view={{
          status: 'done',
          at: '2026-10-19T11:00:00+07:00',
          summary: { added: 2, removed: 0, complete: false },
          unresolved: [],
        }}
        onImport={vi.fn()}
      />,
    );
    expect(screen.getByText('Расписание обновлено частично')).toBeVisible();
    expect(screen.getByText(/Ранее сохранённые пары не удалены/)).toBeVisible();
    expect(
      screen.queryByText('Расписание обновлено', { exact: true }),
    ).not.toBeInTheDocument();
  });

  it('offers no stop action after a connection has been blocked', () => {
    render(
      <LectureStatus
        view={{
          agenda: [],
          import: { status: 'idle' },
          current: {
            jobId: 'job',
            occurrenceId: 'occ',
            title: 'Физика',
            leaveAt: '2026-10-19T11:35:00+07:00',
            status: 'blocked',
          },
        }}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByText('Нужно ваше внимание')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Остановить' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Только слушаю')).not.toBeInTheDocument();
  });

  it.each([
    ['resolving', 'Ищем лекцию'],
    ['joining', 'Подключаемся'],
    ['waiting_room', 'Ожидаем преподавателя'],
    ['reconnecting', 'Восстанавливаем соединение'],
    ['leaving', 'Завершаем подключение'],
  ] as const)('does not claim an active lecture during %s', (status, label) => {
    const view: LecturesView = {
      agenda: [],
      import: { status: 'idle' },
      current: {
        jobId: 'job',
        occurrenceId: 'occ',
        title: 'Физика',
        leaveAt: '2026-10-19T11:35:00+07:00',
        status,
      },
    };
    render(<LectureStatus view={view} onStop={vi.fn()} />);
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.queryByText(/Сейчас идёт:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Только слушаю')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Остановить' })).toBeEnabled();
  });
});
