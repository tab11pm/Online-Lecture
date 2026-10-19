import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  CircleCheck,
  History,
  ListFilter,
  LoaderCircle,
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

function dateLabel(value: string): { date: string; time: string } {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? { date: 'Дата неизвестна', time: '' }
    : {
        date: date.toLocaleDateString('ru-RU'),
        time: date.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }),
      };
}

const recordPlurals = new Intl.PluralRules('ru-RU');
function recordsLabel(count: number): string {
  const forms = {
    one: 'запись',
    few: 'записи',
    many: 'записей',
    other: 'записи',
    zero: 'записей',
    two: 'записи',
  };
  return `Загружено ${count} ${forms[recordPlurals.select(count)]}`;
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
  const [error, setError] = useState<'initial' | 'more'>();

  useEffect(() => headingRef.current?.focus(), []);

  useEffect(() => {
    let active = true;
    requestVersion.current += 1;
    setPage(undefined);
    setLoading(true);
    setLoadingMore(false);
    setError(undefined);
    void desktop.journal
      .list(filter)
      .then((result) => {
        if (!active) return;
        setPage(result);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError('initial');
        setLoading(false);
      });
    return () => {
      active = false;
      requestVersion.current += 1;
    };
  }, [filter, refresh]);

  async function loadMore(): Promise<void> {
    if (!page?.nextCursor || loadingMore) return;
    const version = requestVersion.current;
    setLoadingMore(true);
    setError(undefined);
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
      if (version === requestVersion.current) setError('more');
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
          <span
            className="journal__count"
            aria-live="polite"
            aria-atomic="true"
          >
            {recordsLabel(page.items.length)}
          </span>
        ) : null}
      </div>
      {loading ? (
        <p role="status" className="journal-feedback">
          <LoaderCircle className="spin" size={18} aria-hidden="true" />
          Загрузка журнала…
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="alert alert--error journal-error">
          <TriangleAlert size={18} aria-hidden="true" />
          <div>
            <p>
              {error === 'more'
                ? 'Не удалось загрузить ещё записи.'
                : 'Не удалось загрузить журнал.'}
            </p>
            <p className="journal-error__hint">
              {error === 'more'
                ? 'Уже загруженные записи сохранены. Попробуйте ещё раз.'
                : 'Проверьте, что приложение работает, и повторите попытку.'}
            </p>
            <button
              type="button"
              className="link-button"
              onClick={() =>
                error === 'more'
                  ? void loadMore()
                  : setRefresh((value) => value + 1)
              }
            >
              Повторить
            </button>
          </div>
        </div>
      ) : null}
      {!loading && page?.items.length === 0 ? (
        <div
          role="status"
          className={`journal-empty${filter === 'errors' ? ' is-clear' : ''}`}
        >
          {filter === 'errors' ? (
            <CircleCheck size={26} aria-hidden="true" />
          ) : (
            <History size={26} aria-hidden="true" />
          )}
          <p className="journal-empty__title">
            {filter === 'errors' ? 'Ошибок не найдено' : 'Записей пока нет.'}
          </p>
          <p>
            {filter === 'errors'
              ? 'В этом фильтре отображаются только события, требующие внимания.'
              : 'Здесь появятся результаты лекций, входа и обновления расписания.'}
          </p>
          {filter === 'errors' ? (
            <button
              type="button"
              className="btn"
              onClick={() => setFilter('all')}
            >
              Показать все записи
            </button>
          ) : null}
        </div>
      ) : null}
      {page?.items.length ? (
        <ol
          className="journal-list"
          aria-label="Записи журнала"
          aria-busy={loadingMore}
        >
          {page.items.map((item) => {
            const timestamp = dateLabel(item.at);
            const reason = reasonLabel(item);
            const success =
              item.status === 'completed' || item.status === 'login_succeeded';
            return (
              <li
                key={item.id}
                className={`journal-item${item.isError ? ' is-error' : ''}`}
              >
                <time dateTime={item.at}>
                  <span className="journal-item__date">{timestamp.date}</span>
                  <span className="journal-item__clock">{timestamp.time}</span>
                </time>
                <div className="journal-item__body">
                  <strong>{item.title}</strong>
                  <span
                    className={`journal-item__status${item.isError ? ' is-error' : success ? ' is-success' : ''}`}
                  >
                    {item.isError ? (
                      <TriangleAlert
                        size={12}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    ) : null}
                    {!item.isError && success ? (
                      <CircleCheck size={13} aria-hidden="true" />
                    ) : null}
                    <span>{statusLabel(item)}</span>
                    {reason && reason !== statusLabel(item) ? (
                      <span className="journal-item__reason">· {reason}</span>
                    ) : null}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      {page?.nextCursor && error !== 'more' ? (
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
