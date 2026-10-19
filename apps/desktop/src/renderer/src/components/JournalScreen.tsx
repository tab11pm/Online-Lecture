import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  History,
  ListFilter,
  TriangleAlert,
} from 'lucide-react';
import type {
  JournalFilter,
  JournalItem,
  JournalPage,
} from '../../../shared/journal.js';
import { desktop } from '../api';

interface JournalScreenProps {
  onBack(): void;
}

function statusLabel(item: JournalItem): string {
  switch (item.status) {
    case 'scheduled':
      return 'Запланирована';
    case 'resolving':
      return 'Поиск лекции';
    case 'joining':
      return 'Подключение';
    case 'waiting_room':
      return 'Ожидание преподавателя';
    case 'connected':
      return 'Подключено';
    case 'reconnecting':
      return 'Повторное подключение';
    case 'leaving':
      return 'Выход';
    case 'completed':
      return 'Завершена';
    case 'blocked':
      return 'Заблокирована';
    case 'failed':
      return 'Ошибка';
    case 'skipped':
      return 'Пропущена';
    case 'login_succeeded':
      return 'Вход выполнен';
    case 'auth_required':
      return 'Требуется вход';
    case 'search_ambiguous':
      return 'Нужен выбор лекции';
    case 'import_error':
      return 'Ошибка обновления расписания';
    case 'core_error':
      return 'Ошибка приложения';
    case 'retries_exhausted':
      return 'Попытки подключения исчерпаны';
    case 'lecture_finished':
      return 'Лекция завершена';
    default:
      return 'Событие';
  }
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function reasonLabel(item: JournalItem): string | undefined {
  switch (item.reason) {
    case 'manual':
      return 'Остановлено вручную';
    case 'deadline':
      return 'Время пары истекло';
    case 'meeting_ended':
      return 'Встреча завершена';
    case 'retries_exhausted':
      return 'Попытки подключения исчерпаны';
    case 'error':
      return 'Ошибка подключения';
    default:
      return undefined;
  }
}

export function JournalScreen({ onBack }: JournalScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestVersion = useRef(0);
  const [filter, setFilter] = useState<JournalFilter>('all');
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState<JournalPage>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => headingRef.current?.focus(), []);

  useEffect(() => {
    let active = true;
    requestVersion.current += 1;
    setPage(undefined);
    setLoading(true);
    setError(false);
    void desktop.journal
      .list(filter)
      .then((result) => {
        if (!active) return;
        setPage(result);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filter, refresh]);

  async function loadMore(): Promise<void> {
    if (!page?.nextCursor || loadingMore) return;
    const version = requestVersion.current;
    setLoadingMore(true);
    setError(false);
    try {
      const next = await desktop.journal.list(filter, page.nextCursor);
      if (version !== requestVersion.current) return;
      const seen = new Set(page.items.map((item) => item.id));
      setPage({
        items: [
          ...page.items,
          ...next.items.filter((item) => !seen.has(item.id)),
        ],
        nextCursor: next.nextCursor,
      });
    } catch {
      if (version === requestVersion.current) setError(true);
    } finally {
      if (version === requestVersion.current) setLoadingMore(false);
    }
  }

  return (
    <main className="journal">
      <div className="journal__head">
        <div>
          <p className="eyebrow">История</p>
          <h1 ref={headingRef} tabIndex={-1}>
            <History size={30} strokeWidth={1.6} aria-hidden="true" />
            Журнал
          </h1>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          <ArrowLeft size={15} strokeWidth={1.8} aria-hidden="true" />
          Назад
        </button>
      </div>
      <p className="journal__lede">
        История запусков и важных событий хранится на этом компьютере.
      </p>
      <div className="journal__toolbar">
        <div className="segmented" role="group" aria-label="Фильтр журнала">
          <button
            type="button"
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            <ListFilter size={12} strokeWidth={1.8} aria-hidden="true" />
            Все
          </button>
          <button
            type="button"
            aria-pressed={filter === 'errors'}
            onClick={() => setFilter('errors')}
          >
            <TriangleAlert size={12} strokeWidth={1.8} aria-hidden="true" />
            Ошибки
          </button>
        </div>
        {page ? (
          <span className="journal__count">
            {page.items.length} {page.items.length === 1 ? 'запись' : 'записей'}
          </span>
        ) : null}
      </div>
      {loading ? (
        <p role="status" className="empty">
          Загрузка журнала…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="alert alert--error">
          Не удалось загрузить журнал.{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Повторить
          </button>
        </p>
      ) : null}
      {!loading && page?.items.length === 0 ? (
        <p role="status" className="empty">
          Записей пока нет.
        </p>
      ) : null}
      {page?.items.length ? (
        <ol className="journal-list" aria-label="Записи журнала">
          {page.items.map((item) => (
            <li
              key={item.id}
              className={`journal-item${item.isError ? ' is-error' : ''}`}
            >
              <time dateTime={item.at}>{dateLabel(item.at)}</time>
              <div className="journal-item__body">
                <strong>{item.title}</strong>
                <span className="journal-item__status">
                  {item.isError ? (
                    <TriangleAlert
                      size={12}
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span>{statusLabel(item)}</span>
                  {reasonLabel(item) ? (
                    <span>· {reasonLabel(item)}</span>
                  ) : null}
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      {page?.nextCursor ? (
        <div className="journal__more">
          <button
            type="button"
            className="btn"
            disabled={loadingMore}
            onClick={() => {
              void loadMore();
            }}
          >
            {loadingMore ? (
              'Загрузка…'
            ) : (
              <>
                Показать ещё
                <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      ) : null}
    </main>
  );
}
