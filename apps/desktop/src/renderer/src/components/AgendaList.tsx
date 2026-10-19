import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  CalendarDays,
  CalendarOff,
  EyeOff,
  MoreHorizontal,
  PencilLine,
  RotateCcw,
  SkipForward,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { AgendaItem } from '../../../shared/lectures.js';
import { runStatusLabels, weekdayName } from '../lecture-labels';

export interface AgendaListProps {
  agenda: AgendaItem[];
  onSetSkipped(item: AgendaItem, skipped: boolean): void;
  onEdit?(item: AgendaItem, mode?: 'time' | 'move'): void;
  onDelete?(item: AgendaItem): void;
  onCancelReschedule?(item: AgendaItem): void;
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

export function AgendaList({
  agenda,
  onSetSkipped,
  onEdit,
  onDelete,
  onCancelReschedule,
}: AgendaListProps) {
  const [openMenu, setOpenMenu] = useState<string>();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function closeMenu(restoreFocus = false): void {
    const trigger = triggerRef.current;
    setOpenMenu(undefined);
    if (restoreFocus) trigger?.focus();
  }

  useEffect(() => {
    if (!openMenu) return;
    const firstEnabled = menuRef.current?.querySelector<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    );
    if (firstEnabled) firstEnabled.focus();
    else menuRef.current?.focus();
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        !menuRef.current?.parentElement?.contains(target)
      )
        closeMenu();
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  function moveMenuFocus(event: KeyboardEvent<HTMLDivElement>): void {
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ),
    ];
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Tab') {
      event.preventDefault();
      const trigger = triggerRef.current;
      const controls = [
        ...document.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(
        (element) => !element.closest('.agenda-item__menu, [hidden], [inert]'),
      );
      const triggerIndex = controls.indexOf(trigger!);
      controls[triggerIndex + (event.shiftKey ? -1 : 1)]?.focus();
      closeMenu();
      return;
    }
    let next = current;
    if (event.key === 'ArrowDown')
      next = (current + 1 + items.length) % items.length;
    else if (event.key === 'ArrowUp')
      next = (current - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    items[next]?.focus();
  }

  return (
    <section className="card agenda" aria-label="Ближайшие пары">
      <div className="card__head">
        <h2>
          <CalendarDays size={17} strokeWidth={1.8} aria-hidden="true" />
          Ближайшие пары
        </h2>
      </div>
      {agenda.length === 0 ? (
        <div className="empty-state">
          <CalendarOff
            className="empty-state__icon"
            size={22}
            strokeWidth={1.6}
            aria-hidden="true"
          />
          <p className="empty-state__title">Онлайн-пар не найдено</p>
          <p className="empty-state__text">
            Обновите расписание или добавьте пару вручную.
          </p>
        </div>
      ) : null}
      {groupByDate(agenda).map(([date, items]) => (
        <div className="agenda-day" key={date}>
          <h3>{dayHeading(date)}</h3>
          <span className="agenda-day__count">
            {items.length}{' '}
            {items.length === 1 ? 'пара' : items.length < 5 ? 'пары' : 'пар'}
          </span>
          <ul className="agenda-list">
            {items.map((item) => (
              <li
                className={`agenda-item${item.skipped ? ' is-skipped' : ''}`}
                key={`${item.jobId}:${item.occurrenceId}`}
              >
                <div className="agenda-item__time">
                  <span>
                    {item.joinAt}–{item.leaveAt}
                  </span>
                </div>
                <div className="agenda-item__body">
                  <p className="agenda-item__title">{item.title}</p>
                  <div className="agenda-item__meta">
                    <span>
                      {item.source === 'manual' ? 'вручную' : 'из расписания'}
                    </span>
                    {item.runStatus ? (
                      <span className="chip chip--sm">
                        {runStatusLabels[item.runStatus]}
                      </span>
                    ) : null}
                    {item.skipped && item.runStatus !== 'skipped' ? (
                      <span className="chip chip--sm">Пропущена</span>
                    ) : null}
                    {item.rescheduledFrom ? (
                      <span className="chip chip--sm">перенос</span>
                    ) : null}
                  </div>
                </div>
                <div className="agenda-item__actions">
                  <button
                    type="button"
                    ref={
                      openMenu === `${item.jobId}:${item.occurrenceId}`
                        ? triggerRef
                        : undefined
                    }
                    className="icon-btn agenda-item__menu-trigger"
                    aria-label={`Действия для пары: ${item.title}`}
                    aria-haspopup="menu"
                    aria-controls={`agenda-menu-${item.jobId}-${item.occurrenceId}`}
                    aria-expanded={
                      openMenu === `${item.jobId}:${item.occurrenceId}`
                    }
                    onClick={(event) => {
                      const key = `${item.jobId}:${item.occurrenceId}`;
                      triggerRef.current = event.currentTarget;
                      setOpenMenu((current) =>
                        current === key ? undefined : key,
                      );
                    }}
                  >
                    <MoreHorizontal
                      size={17}
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  </button>
                  {openMenu === `${item.jobId}:${item.occurrenceId}` ? (
                    <div
                      id={`agenda-menu-${item.jobId}-${item.occurrenceId}`}
                      ref={menuRef}
                      className="agenda-item__menu"
                      role="menu"
                      aria-label={`Действия: ${item.title}`}
                      tabIndex={-1}
                      onKeyDown={moveMenuFocus}
                    >
                      {item.source === 'timetable' ? (
                        <button
                          type="button"
                          className="menu-button"
                          role="menuitem"
                          onClick={() => {
                            closeMenu(true);
                            onSetSkipped(item, !item.skipped);
                          }}
                        >
                          {item.skipped ? (
                            <RotateCcw
                              size={14}
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                          ) : (
                            <SkipForward
                              size={14}
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                          )}
                          {item.skipped ? 'Вернуть' : 'Пропустить'}
                        </button>
                      ) : null}
                      {item.source === 'timetable' && item.editable ? (
                        <>
                          <button
                            type="button"
                            className="menu-button"
                            role="menuitem"
                            onClick={() => {
                              closeMenu(true);
                              onEdit?.(item, 'time');
                            }}
                          >
                            <PencilLine
                              size={14}
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                            Изменить время
                          </button>
                          <button
                            type="button"
                            className="menu-button"
                            role="menuitem"
                            onClick={() => {
                              closeMenu(true);
                              onEdit?.(item, 'move');
                            }}
                          >
                            <CalendarDays
                              size={14}
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                            Перенести
                          </button>
                        </>
                      ) : null}
                      {item.rescheduledFrom ? (
                        <button
                          type="button"
                          className="menu-button"
                          role="menuitem"
                          disabled={!item.editable}
                          onClick={() => {
                            closeMenu(true);
                            onCancelReschedule?.(item);
                          }}
                          title={
                            !item.editable ? 'Пара уже началась' : undefined
                          }
                        >
                          <Undo2
                            size={14}
                            strokeWidth={1.8}
                            aria-hidden="true"
                          />
                          Отменить перенос
                        </button>
                      ) : null}
                      {!item.rescheduledFrom &&
                      (item.source === 'manual' || item.editable) ? (
                        <button
                          type="button"
                          className="menu-button menu-button--danger"
                          role="menuitem"
                          onClick={() => {
                            closeMenu(true);
                            onDelete?.(item);
                          }}
                        >
                          {item.source === 'manual' ? (
                            <Trash2
                              size={14}
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                          ) : (
                            <EyeOff
                              size={14}
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                          )}
                          {item.source === 'manual' ? 'Удалить' : 'Скрыть пару'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
