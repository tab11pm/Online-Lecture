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
import type { JournalPage } from '../../src/shared/journal.js';

const fake = vi.hoisted(() => {
  const openListeners = new Set<() => void>();
  const list =
    vi.fn<
      (filter: 'all' | 'errors', cursor?: string) => Promise<JournalPage>
    >();
  const api = {
    onboarding: {
      getState: vi.fn(async () => ({ phase: 'session_ready' as const })),
      onChanged: vi.fn(() => () => undefined),
    },
    journal: {
      list,
      consumeOpenRequest: vi.fn(async () => false),
      onOpen: vi.fn((listener: () => void) => {
        openListeners.add(listener);
        return () => openListeners.delete(listener);
      }),
    },
    lectures: {
      getView: vi.fn(async () => ({ agenda: [], import: { status: 'idle' } })),
      onChanged: vi.fn(() => () => undefined),
    },
    core: { onNotification: vi.fn(() => () => undefined) },
    app: {
      getBrowser: vi.fn(async () => ({
        choice: 'edge',
        install: { status: 'missing' },
      })),
      onBrowserChanged: vi.fn(() => () => undefined),
      getInfo: vi.fn(async () => ({ version: '0.0.0', autostart: false })),
      getShowLectureWindow: vi.fn(async () => false),
    },
  } as unknown as DesktopApi;
  (window as unknown as { desktop: DesktopApi }).desktop = api;
  return {
    api,
    list,
    openListeners,
    open: () => {
      for (const listener of openListeners) listener();
    },
  };
});

import { App } from '../../src/renderer/src/App';

beforeEach(() => {
  fake.list.mockReset();
  fake.list.mockResolvedValue({ items: [] });
  vi.mocked(fake.api.journal.consumeOpenRequest).mockReset();
  vi.mocked(fake.api.journal.consumeOpenRequest).mockResolvedValue(false);
});
afterEach(cleanup);

describe('journal screen', () => {
  it('opens from a notification even during onboarding and returns to it', async () => {
    vi.mocked(fake.api.onboarding.getState).mockResolvedValueOnce({
      phase: 'credentials',
    });
    render(<App />);
    act(() => fake.open());
    expect(
      await screen.findByRole('heading', { name: 'Журнал' }),
    ).toHaveFocus();
    await waitFor(() =>
      expect(fake.api.journal.consumeOpenRequest).toHaveBeenCalledTimes(2),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(
      screen.queryByRole('heading', { name: 'Журнал' }),
    ).not.toBeInTheDocument();
  });

  it('consumes a notification click that arrived before renderer mount', async () => {
    vi.mocked(fake.api.journal.consumeOpenRequest).mockResolvedValueOnce(true);
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Журнал' }),
    ).toBeVisible();
  });

  it('shows outcomes and redacted titles in newest-first order', async () => {
    fake.list.mockResolvedValueOnce({
      items: [
        {
          id: 'a',
          at: '2026-10-19T12:00:00+07:00',
          title: 'Физика [REDACTED]',
          status: 'failed',
          reason: 'retries_exhausted',
          isError: true,
        },
        {
          id: 'b',
          at: '2026-10-19T11:00:00+07:00',
          title: 'Алгебра',
          status: 'blocked',
          isError: true,
        },
        {
          id: 'c',
          at: '2026-10-19T10:00:00+07:00',
          title: 'История',
          status: 'completed',
          isError: false,
        },
      ],
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Журнал' }));
    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Физика [REDACTED]'),
      expect.stringContaining('Алгебра'),
      expect.stringContaining('История'),
    ]);
    expect(within(rows[0]!).getByText('Ошибка')).toBeVisible();
    expect(within(rows[1]!).getByText('Заблокирована')).toBeVisible();
    expect(within(rows[2]!).getByText('Завершена')).toBeVisible();
    expect(screen.queryByText(/https:\/\//)).not.toBeInTheDocument();
  });

  it('names an active run by its actual state', async () => {
    fake.list.mockResolvedValueOnce({
      items: [
        {
          id: 'active',
          at: '2026-10-19T12:00:00Z',
          title: 'Физика',
          status: 'connected',
          isError: false,
        },
      ],
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Журнал' }));
    expect(await screen.findByText('Подключено')).toBeVisible();
  });

  it('filters errors and loads the next page once without duplicate rows', async () => {
    fake.list.mockImplementation(async (filter, cursor) => {
      if (filter === 'all') return { items: [] };
      if (!cursor)
        return {
          items: [
            {
              id: 'a',
              at: '2026-10-19T12:00:00Z',
              title: 'Ошибка A',
              status: 'failed',
              isError: true,
            },
          ],
          nextCursor: 'cursor-1',
        };
      return {
        items: [
          {
            id: 'a',
            at: '2026-10-19T12:00:00Z',
            title: 'Ошибка A',
            status: 'failed',
            isError: true,
          },
          {
            id: 'b',
            at: '2026-10-19T11:00:00Z',
            title: 'Ошибка B',
            status: 'blocked',
            isError: true,
          },
        ],
      };
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Журнал' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ошибки' }));
    expect(await screen.findByText('Ошибка A')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await waitFor(() =>
      expect(screen.getAllByRole('listitem')).toHaveLength(2),
    );
    expect(fake.list).toHaveBeenCalledWith('errors', 'cursor-1');
    expect(
      screen.queryByRole('button', { name: 'Показать ещё' }),
    ).not.toBeInTheDocument();
  });

  it('shows empty and load-error states', async () => {
    fake.list.mockRejectedValueOnce(new Error('Нет соединения с ядром'));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Журнал' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить журнал',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Записей пока нет'),
    );
  });
});
