import { CircleAlert, RefreshCw, TriangleAlert } from 'lucide-react';
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
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('ru-RU');
}

export interface ImportPanelProps {
  view: ImportView;
  onImport(): void;
}

export function ImportPanel({ view, onImport }: ImportPanelProps) {
  const running = view.status === 'running';
  const updatedAt =
    view.status === 'done'
      ? view.at
      : view.status === 'idle'
        ? view.lastSuccessAt
        : undefined;
  return (
    <section className="card import-card" aria-label="Расписание">
      <div className="card__head">
        <h2>
          <RefreshCw size={17} strokeWidth={1.8} aria-hidden="true" />
          Расписание
        </h2>
        <span className="card__index">03</span>
      </div>
      {updatedAt ? (
        <p className="import-card__updated">
          Обновлено: {formatTime(updatedAt)}
        </p>
      ) : null}
      {view.status === 'running' ? (
        <ol className="import-steps">
          {stages.map((stage) => (
            <li
              key={stage.id}
              aria-current={stage.id === view.stage ? 'step' : undefined}
            >
              {stage.label}
            </li>
          ))}
        </ol>
      ) : null}
      {view.status === 'done' && view.unresolved.length > 0 ? (
        <div className="alert alert--warn">
          <p className="alert__row">
            <TriangleAlert size={14} strokeWidth={1.8} aria-hidden="true" />
            Не удалось найти лекцию в СДО:
          </p>
          <ul>
            {view.unresolved.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {view.status === 'failed' ? (
        <p role="alert" className="alert alert--error alert__row">
          <CircleAlert size={14} strokeWidth={1.8} aria-hidden="true" />
          {view.message}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={running}
        onClick={onImport}
      >
        <RefreshCw size={15} strokeWidth={1.8} aria-hidden="true" />
        Обновить расписание
      </button>
      <p className="fineprint">
        Онлайн-пары берутся из расписания ТУСУР и обновляются автоматически.
      </p>
    </section>
  );
}
