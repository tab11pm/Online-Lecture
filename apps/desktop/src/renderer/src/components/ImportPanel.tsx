import { useEffect, useState } from 'react';
import {
  Check,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import type { ImportStage, ImportView } from '../../../shared/lectures.js';

const stages: Array<{ id: ImportStage; label: string }> = [
  { id: 'group', label: 'Поиск группы' },
  { id: 'schedule', label: 'Расписание' },
  { id: 'courses', label: 'Курсы СДО' },
  { id: 'lectures', label: 'Лекции BBB' },
  { id: 'saving', label: 'Сохранение' },
];

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'дата неизвестна'
    : date.toLocaleString('ru-RU', {
        dateStyle: 'short',
        timeStyle: 'short',
        hourCycle: 'h23',
      });
}

export interface ImportPanelProps {
  view: ImportView;
  onImport(): void | Promise<void>;
}

export function ImportPanel({ view, onImport }: ImportPanelProps) {
  const [pending, setPending] = useState(false);
  const [requestError, setRequestError] = useState<string>();
  const running = view.status === 'running' || pending;
  const failure =
    requestError ?? (view.status === 'failed' ? view.message : undefined);
  const currentStage =
    view.status === 'running'
      ? stages.findIndex((stage) => stage.id === view.stage)
      : -1;
  const updatedAt = view.status === 'done' ? view.at : view.lastSuccessAt;
  const eventKey =
    view.status === 'done' || view.status === 'failed'
      ? `${view.status}:${view.at}`
      : view.status;
  useEffect(() => setRequestError(undefined), [eventKey]);

  async function startImport(): Promise<void> {
    if (running) return;
    setPending(true);
    setRequestError(undefined);
    try {
      await onImport();
    } catch (reason) {
      setRequestError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось запустить обновление расписания.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card import-card" aria-label="Расписание">
      <div className="card__head">
        <h2>
          <RefreshCw size={17} strokeWidth={1.8} aria-hidden="true" />
          Расписание
        </h2>
      </div>
      {updatedAt ? (
        <p className="import-card__updated">
          Обновлено: {formatTime(updatedAt)}
        </p>
      ) : null}
      {running ? (
        <p role="status" className="import-card__progress">
          <LoaderCircle className="spin" size={15} aria-hidden="true" />
          Обновляем расписание…
        </p>
      ) : null}
      {view.status === 'done' ? (
        <div
          className={`import-result${!view.summary.complete || view.unresolved.length ? ' is-partial' : ''}`}
        >
          {view.summary.complete && !view.unresolved.length ? (
            <CircleCheck size={16} aria-hidden="true" />
          ) : (
            <TriangleAlert size={16} aria-hidden="true" />
          )}
          <div>
            <p>
              {view.summary.complete && !view.unresolved.length
                ? 'Расписание обновлено'
                : 'Расписание обновлено частично'}
            </p>
            <p className="import-result__detail">
              Добавлено: {view.summary.added} · Убрано: {view.summary.removed}
            </p>
          </div>
        </div>
      ) : null}
      {view.status === 'running' ? (
        <ol className="import-steps" aria-label="Этапы обновления">
          {stages.map((stage, index) => (
            <li
              key={stage.id}
              className={index < currentStage ? 'is-complete' : undefined}
              aria-current={stage.id === view.stage ? 'step' : undefined}
            >
              {index < currentStage ? (
                <Check size={14} aria-hidden="true" />
              ) : stage.id === view.stage ? (
                <LoaderCircle className="spin" size={14} aria-hidden="true" />
              ) : null}
              {stage.label}
            </li>
          ))}
        </ol>
      ) : null}
      {view.status === 'done' &&
      (view.unresolved.length > 0 || !view.summary.complete) ? (
        <div className="alert alert--warn">
          {!view.summary.complete ? (
            <p>
              Часть расписания пока недоступна. Ранее сохранённые пары не
              удалены.
            </p>
          ) : null}
          {view.unresolved.length ? (
            <>
              <p className="alert__row">
                <TriangleAlert size={14} strokeWidth={1.8} aria-hidden="true" />
                Не удалось найти лекцию в СДО:
              </p>
              <ul>
                {view.unresolved.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
      {failure && !running ? (
        <p role="alert" className="alert alert--error alert__row">
          <CircleAlert size={14} strokeWidth={1.8} aria-hidden="true" />
          {failure}
        </p>
      ) : null}
      {failure && !running ? (
        <p className="import-card__recovery">
          {updatedAt
            ? 'Сохранённое расписание остаётся доступным. Повторите обновление, когда связь восстановится.'
            : 'Попробуйте обновить расписание ещё раз или добавьте пару вручную.'}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={running}
        onClick={() => void startImport()}
        aria-busy={running}
      >
        <RefreshCw
          className={running ? 'spin' : undefined}
          size={15}
          strokeWidth={1.8}
          aria-hidden="true"
        />
        {failure && !running ? 'Повторить обновление' : 'Обновить расписание'}
      </button>
      <p className="fineprint">
        Онлайн-пары берутся из расписания ТУСУР и обновляются автоматически.
      </p>
    </section>
  );
}
