import { redactSensitiveText } from '@core/core/redaction.js';
import type { NewJournalEvent } from '../shared/journal.js';

export interface NotificationLike {
  show(): void;
  on(event: 'click', listener: () => void): unknown;
}

export type NotificationFactory = (options: {
  title: string;
  body: string;
}) => NotificationLike;

function safeTitle(title: string): string {
  const text = redactSensitiveText(title).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 120) : 'Лекция';
}

function bodyFor(event: NewJournalEvent): string {
  const title = safeTitle(event.title);
  switch (event.code) {
    case 'login_succeeded':
      return 'Вход в ТУСУР выполнен.';
    case 'auth_required':
      return 'Сессия ТУСУР истекла. Войдите снова.';
    case 'search_ambiguous':
      return 'Найдено несколько лекций. Уточните выбор в приложении.';
    case 'import_error':
      return 'Не удалось обновить расписание.';
    case 'core_error':
      return 'Ошибка приложения. Откройте журнал.';
    case 'retries_exhausted':
      return `${title}: повторные попытки подключения исчерпаны.`;
    case 'lecture_finished':
      if (event.status === 'completed') return `${title}: лекция завершена.`;
      if (event.status === 'blocked')
        return `${title}: доступ к лекции заблокирован.`;
      return `${title}: не удалось подключиться к лекции.`;
  }
}

export class DesktopNotifier {
  private readonly shown = new Set<number>();

  constructor(
    private readonly create: NotificationFactory,
    private readonly onOpenJournal: () => void,
  ) {}

  show(event: NewJournalEvent): void {
    if (
      !Number.isSafeInteger(event.id) ||
      event.id <= 0 ||
      this.shown.has(event.id)
    )
      return;
    this.shown.add(event.id);
    try {
      const notification = this.create({
        title: 'Online Lecture',
        body: bodyFor(event),
      });
      notification.on('click', this.onOpenJournal);
      notification.show();
    } catch {
      // OS notification support is best effort. The journal stays available.
    }
  }
}
