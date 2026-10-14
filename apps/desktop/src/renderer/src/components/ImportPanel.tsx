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
    <section aria-label="Расписание">
      <h2>Расписание</h2>
      {updatedAt ? <p>Обновлено: {formatTime(updatedAt)}</p> : null}
      {view.status === 'running' ? (
        <ol>
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
        <div>
          <p>Не удалось найти лекцию в СДО:</p>
          <ul>
            {view.unresolved.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {view.status === 'failed' ? <p role="alert">{view.message}</p> : null}
      <button type="button" disabled={running} onClick={onImport}>
        Обновить расписание
      </button>
    </section>
  );
}
