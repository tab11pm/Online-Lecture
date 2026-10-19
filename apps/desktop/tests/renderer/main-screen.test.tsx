// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '../../src/shared/ipc-contract.js';
import type { AgendaItem, LecturesView } from '../../src/shared/lectures.js';

const fake = vi.hoisted(() => {
  const listeners = new Set<(view: LecturesView) => void>();
  const notifyListeners = new Set<
    (notification: { level: 'error' | 'info'; message: string }) => void
  >();
  const noop = vi.fn(() => Promise.resolve());
  const getView = vi.fn((): Promise<LecturesView> =>
    Promise.resolve({ agenda: [], import: { status: 'idle' } }),
  );
  const api = {
    journal: {
      list: vi.fn(() => Promise.resolve({ items: [] })),
      consumeOpenRequest: vi.fn(() => Promise.resolve(false)),
      onOpen: vi.fn(() => () => undefined),
    },
    onboarding: {
      getState: vi.fn(() =>
        Promise.resolve({ phase: 'session_ready' as const }),
      ),
      login: vi.fn(),
      openManualSso: vi.fn(),
      checkSession: vi.fn(() =>
        Promise.resolve({ phase: 'session_ready' as const }),
      ),
      onChanged: vi.fn(() => () => undefined),
    },
    app: {
      getBrowser: vi.fn(() =>
        Promise.resolve({ choice: 'edge', install: { status: 'missing' } }),
      ),
      setBrowser: vi.fn(),
      installChromium: vi.fn(),
      onBrowserChanged: vi.fn(() => () => undefined),
      getInfo: vi.fn(() =>
        Promise.resolve({ version: '0.0.0', autostart: false }),
      ),
      setAutostart: vi.fn(),
      quit: noop,
      getShowLectureWindow: vi.fn(() => Promise.resolve(false)),
      setShowLectureWindow: vi.fn((show: boolean) => Promise.resolve(show)),
    },
    lectures: {
      getView,
      importNow: vi.fn(() => Promise.resolve()),
      stopCurrent: vi.fn(() => Promise.resolve()),
      setSkipped: vi.fn(() => Promise.resolve()),
      resolveManualTarget: vi.fn(async () => ({
        status: 'not_found' as const,
      })),
      saveManual: vi.fn(async () => undefined),
      editImportedTime: vi.fn(async () => undefined),
      reschedule: vi.fn(async () => 'manual:2'),
      cancelReschedule: vi.fn(async () => undefined),
      deleteLecture: vi.fn(async () => undefined),
      onChanged: vi.fn((listener: (view: LecturesView) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
    },
    core: {
      onNotification: vi.fn(
        (
          listener: (notification: {
            level: 'error' | 'info';
            message: string;
          }) => void,
        ) => {
          notifyListeners.add(listener);
          return () => notifyListeners.delete(listener);
        },
      ),
    },
  } as unknown as DesktopApi;
  (window as unknown as { desktop: DesktopApi }).desktop = api;
  return {
    api,
    getView,
    listenerCount: () => listeners.size,
    notifyCount: () => notifyListeners.size,
    notify: (notification: { level: 'error' | 'info'; message: string }) => {
      for (const listener of notifyListeners) listener(notification);
    },
    emit: (view: LecturesView) => {
      for (const listener of listeners) listener(view);
    },
  };
});

import { App } from '../../src/renderer/src/App';

function item(overrides: Partial<AgendaItem> = {}): AgendaItem {
  return {
    jobId: 'job-1',
    occurrenceId: 'occ-1',
    title: 'Математический анализ',
    source: 'timetable',
    editable: true,
    date: '2026-10-19',
    joinAt: '08:50',
    leaveAt: '10:25',
    skipped: false,
    ...overrides,
  };
}

function show(view: Partial<LecturesView>): void {
  fake.getView.mockResolvedValue({
    agenda: [],
    import: { status: 'idle' },
    ...view,
  });
}

beforeEach(() => {
  fake.getView.mockClear();
  vi.mocked(fake.api.lectures.importNow).mockClear();
  vi.mocked(fake.api.lectures.stopCurrent).mockClear();
  vi.mocked(fake.api.lectures.setSkipped).mockClear();
  vi.mocked(fake.api.app.setShowLectureWindow).mockClear();
  vi.mocked(fake.api.app.getShowLectureWindow).mockClear();
  vi.mocked(fake.api.app.getBrowser).mockResolvedValue({
    choice: 'edge',
    install: { status: 'missing' },
  });
  show({});
});

afterEach(() => {
  cleanup();
});

describe('main screen', () => {
  it('opens the journal from the main button', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Журнал' }));
    expect(
      await screen.findByRole('heading', { name: 'Журнал' }),
    ).toBeVisible();
  });

  it('keeps the current main view and editor state when returning from the journal', async () => {
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Добавить пару' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Журнал' }));
    expect(
      await screen.findByRole('heading', { name: 'Журнал' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByRole('region', { name: 'Добавить пару' })).toBeVisible();
    expect(fake.getView).toHaveBeenCalledTimes(1);
  });
  it('opens schedule editing and routes deletion to the selected occurrence', async () => {
    show({ agenda: [item()] });
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Изменить / перенести' }),
    );
    expect(
      screen.getByRole('region', { name: /Изменить Математический анализ/ }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть пару' }));
    expect(fake.api.lectures.deleteLecture).toHaveBeenCalledWith(
      'job-1',
      'occ-1',
    );
  });

  it('passes the selected occurrence when hiding the second pair on one day', async () => {
    show({
      agenda: [
        item({ occurrenceId: 'occ-first' }),
        item({ occurrenceId: 'occ-second', joinAt: '10:40', leaveAt: '12:15' }),
      ],
    });
    render(<App />);
    const buttons = await screen.findAllByRole('button', {
      name: 'Скрыть пару',
    });
    fireEvent.click(buttons[1]!);
    expect(fake.api.lectures.deleteLecture).toHaveBeenCalledWith(
      'job-1',
      'occ-second',
    );
  });

  it('opens the manual lecture wizard from the main screen', async () => {
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Добавить пару' }),
    );
    expect(screen.getByRole('region', { name: 'Добавить пару' })).toBeVisible();
  });

  it('shows core notifications in an alert and unsubscribes on unmount', async () => {
    const { unmount } = render(<App />);
    await screen.findByText('Загрузка…').catch(() => undefined);
    await waitFor(() => expect(fake.notifyCount()).toBe(1));

    act(() =>
      fake.notify({
        level: 'error',
        message: 'Процесс ядра неожиданно завершился.',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Процесс ядра неожиданно завершился.',
    );
    unmount();
    expect(fake.notifyCount()).toBe(0);
  });

  it('shows the Chromium install button outside the collapsed settings', async () => {
    vi.mocked(fake.api.app.getBrowser).mockResolvedValue({
      choice: 'chromium',
      install: { status: 'missing' },
    });
    render(<App />);

    const button = await screen.findByRole('button', {
      name: 'Установить Chromium',
    });
    expect(button).toBeVisible();
    expect(button.closest('details')).toBeNull();
  });

  it('shows the running lecture with a stop button', async () => {
    show({
      current: {
        jobId: 'job-1',
        occurrenceId: 'occ-1',
        title: 'Физика',
        leaveAt: '2026-10-19T10:25:00+07:00',
        status: 'connected',
      },
    });
    render(<App />);

    expect(
      await screen.findByText('Сейчас идёт: Физика, до 10:25'),
    ).toBeVisible();
    expect(screen.getByText('Состояние: подключено')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Остановить' }));
    expect(fake.api.lectures.stopCurrent).toHaveBeenCalledTimes(1);
  });

  it('shows the next lecture when idle', async () => {
    show({ next: item({ title: 'Физика' }) });
    render(<App />);

    expect(
      await screen.findByText('Ближайшая: понедельник 08:50 Физика'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Остановить' }),
    ).not.toBeInTheDocument();
  });

  it('shows the last run with its status and reason', async () => {
    show({
      lastRun: {
        title: 'Физика',
        status: 'completed',
        completionReason: 'manual',
        at: '2026-10-19T10:25:00+07:00',
      },
    });
    render(<App />);

    expect(
      await screen.findByText(
        'Последний запуск: Физика — завершена, остановлено вручную',
      ),
    ).toBeVisible();
  });

  it('says so when there are no online lectures', async () => {
    render(<App />);
    expect(
      (await screen.findAllByText('Онлайн-пар не найдено')).length,
    ).toBeGreaterThan(0);
  });

  it('shows import progress and disables the refresh button while running', async () => {
    show({ import: { status: 'running', stage: 'courses' } });
    render(<App />);

    const button = await screen.findByRole('button', {
      name: 'Обновить расписание',
    });
    expect(button).toBeDisabled();
    const steps = screen
      .getAllByRole('listitem')
      .filter((li) =>
        [
          'Поиск группы',
          'Расписание',
          'Курсы СДО',
          'Лекции BBB',
          'Сохранение',
        ].includes(li.textContent ?? ''),
      );
    expect(steps.map((li) => li.textContent)).toEqual([
      'Поиск группы',
      'Расписание',
      'Курсы СДО',
      'Лекции BBB',
      'Сохранение',
    ]);
    expect(screen.getByText('Курсы СДО')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByText('Лекции BBB')).not.toHaveAttribute('aria-current');
  });

  it('starts an import from the refresh button', async () => {
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Обновить расписание' }),
    );
    expect(fake.api.lectures.importNow).toHaveBeenCalledTimes(1);
  });

  it('lists unresolved disciplines after a partial import', async () => {
    show({
      import: {
        status: 'done',
        at: '2026-10-19T08:00:00Z',
        summary: { added: 1, removed: 0, complete: true },
        unresolved: ['Теория вероятностей'],
      },
    });
    render(<App />);

    expect(
      await screen.findByText('Не удалось найти лекцию в СДО:'),
    ).toBeVisible();
    expect(screen.getByText('Теория вероятностей')).toBeVisible();
    expect(screen.getByText(/Обновлено:/)).toBeVisible();
  });

  it('shows an import error with retry', async () => {
    show({
      import: {
        status: 'failed',
        at: '2026-10-19T08:00:00Z',
        message: 'Нет связи с timetable',
      },
    });
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нет связи с timetable',
    );
    const retry = screen.getByRole('button', { name: 'Обновить расписание' });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(fake.api.lectures.importNow).toHaveBeenCalledTimes(1);
  });

  it('toggles skip and restore for an occurrence', async () => {
    show({
      agenda: [
        item(),
        item({ jobId: 'job-2', occurrenceId: 'occ-2', skipped: true }),
      ],
    });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Пропустить' }));
    expect(fake.api.lectures.setSkipped).toHaveBeenCalledWith(
      'job-1',
      'occ-1',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Вернуть' }));
    expect(fake.api.lectures.setSkipped).toHaveBeenCalledWith(
      'job-2',
      'occ-2',
      false,
    );
  });

  it('groups the agenda by day', async () => {
    show({
      agenda: [
        item({ title: 'Физика' }),
        item({ occurrenceId: 'occ-2', title: 'Химия', joinAt: '10:40' }),
        item({
          jobId: 'job-3',
          occurrenceId: 'occ-3',
          title: 'История',
          date: '2026-10-20',
          runStatus: 'scheduled',
        }),
      ],
    });
    render(<App />);

    const days = await screen.findAllByRole('heading', { level: 3 });
    expect(days.map((day) => day.textContent)).toEqual([
      'понедельник, 19.10.2026',
      'вторник, 20.10.2026',
    ]);
    const first = days[0].parentElement as HTMLElement;
    expect(within(first).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(/История/).parentElement).toHaveTextContent(
      'запланирована',
    );
  });

  it('toggles the lecture window setting', async () => {
    render(<App />);
    const toggle = await screen.findByRole('checkbox', {
      name: 'Показывать окно лекции',
    });
    await waitFor(() => expect(toggle).not.toBeChecked());
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(fake.api.app.setShowLectureWindow).toHaveBeenCalledWith(true),
    );
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it('updates on lectures.onChanged', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'Обновить расписание' });

    act(() => {
      fake.emit({
        agenda: [],
        import: { status: 'idle' },
        next: item({ title: 'Информатика' }),
      });
    });

    expect(
      await screen.findByText('Ближайшая: понедельник 08:50 Информатика'),
    ).toBeVisible();
  });

  it('reverts the lecture window setting when saving fails', async () => {
    vi.mocked(fake.api.app.setShowLectureWindow).mockRejectedValueOnce(
      new Error('Не удалось сохранить'),
    );
    render(<App />);
    const toggle = await screen.findByRole('checkbox', {
      name: 'Показывать окно лекции',
    });
    await waitFor(() => expect(toggle).not.toBeChecked());
    fireEvent.click(toggle);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось сохранить',
    );
    expect(toggle).not.toBeChecked();
  });

  it('reverts autostart when saving fails', async () => {
    vi.mocked(fake.api.app.setAutostart).mockRejectedValueOnce(
      new Error('Автозапуск недоступен'),
    );
    render(<App />);
    const toggle = await screen.findByRole('checkbox', {
      name: /запускать при старте/i,
    });
    fireEvent.click(toggle);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Автозапуск недоступен',
    );
    expect(toggle).not.toBeChecked();
  });

  it('starts the lecture window setting from the stored value', async () => {
    vi.mocked(fake.api.app.getShowLectureWindow).mockResolvedValueOnce(true);
    render(<App />);
    const toggle = await screen.findByRole('checkbox', {
      name: 'Показывать окно лекции',
    });
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it('falls back to showing the lecture window when reading fails', async () => {
    vi.mocked(fake.api.app.getShowLectureWindow).mockRejectedValueOnce(
      new Error('boom'),
    );
    render(<App />);
    const toggle = await screen.findByRole('checkbox', {
      name: 'Показывать окно лекции',
    });
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it('shows an alert when stopping fails', async () => {
    show({
      current: {
        jobId: 'job-1',
        occurrenceId: 'occ-1',
        title: 'Физика',
        leaveAt: '2026-10-19T10:25:00+07:00',
        status: 'connected',
      },
    });
    vi.mocked(fake.api.lectures.stopCurrent).mockRejectedValueOnce(
      new Error('Не удалось остановить'),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Остановить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось остановить',
    );
  });

  it('shows an alert when the import request fails', async () => {
    vi.mocked(fake.api.lectures.importNow).mockRejectedValueOnce(
      new Error('Импорт недоступен'),
    );
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Обновить расписание' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Импорт недоступен',
    );
  });

  it('shows an alert when skipping fails', async () => {
    show({ agenda: [item()] });
    vi.mocked(fake.api.lectures.setSkipped).mockRejectedValueOnce(
      new Error('Не удалось пропустить'),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Пропустить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось пропустить',
    );
  });

  it('unsubscribes from lecture updates on unmount', async () => {
    const { unmount } = render(<App />);
    await screen.findByRole('button', { name: 'Обновить расписание' });
    expect(fake.listenerCount()).toBe(1);
    unmount();
    expect(fake.listenerCount()).toBe(0);
  });
});
