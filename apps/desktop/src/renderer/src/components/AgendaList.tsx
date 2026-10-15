import type { AgendaItem } from '../../../shared/lectures.js';
import { runStatusLabels, weekdayName } from '../lecture-labels';

export interface AgendaListProps {
  agenda: AgendaItem[];
  onSetSkipped(item: AgendaItem, skipped: boolean): void;
}

function groupByDate(agenda: AgendaItem[]): Array<[string, AgendaItem[]]> {
  const groups = new Map<string, AgendaItem[]>();
  for (const item of agenda) {
    const group = groups.get(item.date);
    if (group) group.push(item);
    else groups.set(item.date, [item]);
  }
  return [...groups.entries()];
}

function dayHeading(date: string): string {
  const [year, month, day] = date.split('-');
  return `${weekdayName(date)}, ${day}.${month}.${year}`;
}

export function AgendaList({ agenda, onSetSkipped }: AgendaListProps) {
  return (
    <section aria-label="Ближайшие пары">
      <h2>Ближайшие пары</h2>
      {agenda.length === 0 ? <p>Онлайн-пар не найдено</p> : null}
      {groupByDate(agenda).map(([date, items]) => (
        <div key={date}>
          <h3>{dayHeading(date)}</h3>
          <ul>
            {items.map((item) => (
              <li key={`${item.jobId}:${item.occurrenceId}`}>
                <span>
                  {item.joinAt}–{item.leaveAt} {item.title}
                </span>
                {item.runStatus ? (
                  <span> ({runStatusLabels[item.runStatus]})</span>
                ) : null}{' '}
                <button
                  type="button"
                  onClick={() => onSetSkipped(item, !item.skipped)}
                >
                  {item.skipped ? 'Вернуть' : 'Пропустить'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
