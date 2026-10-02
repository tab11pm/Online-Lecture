import { JSDOM } from 'jsdom';
import type { ParsedLesson } from './types.js';

export class ScheduleParseError extends Error {
  constructor(message = 'Schedule table not found') {
    super(message);
    this.name = 'ScheduleParseError';
  }
}

const MONTHS: Record<string, string> = {
  янв: '01',
  января: '01',
  фев: '02',
  февраля: '02',
  мар: '03',
  марта: '03',
  апр: '04',
  апреля: '04',
  май: '05',
  мая: '05',
  июн: '06',
  июня: '06',
  июл: '07',
  июля: '07',
  авг: '08',
  августа: '08',
  сен: '09',
  сент: '09',
  сентября: '09',
  окт: '10',
  октября: '10',
  ноя: '11',
  ноября: '11',
  дек: '12',
  декабря: '12',
};

export function discoverMyScheduleHref(html: string): string | undefined {
  const { document } = new JSDOM(html).window;

  for (const anchor of Array.from(document.querySelectorAll('a'))) {
    const text = anchor.textContent ?? '';
    if (text.includes('Мое расписание') || text.includes('Моё расписание')) {
      return anchor.getAttribute('href') ?? undefined;
    }
  }

  return undefined;
}

export function parseFacultyAndGroup(
  href: string,
): { faculty: string; group: string } | undefined {
  const match = href.match(/faculties\/([^/]+)\/groups\/([^/?#]+)/);
  if (!match || !match[1] || !match[2]) {
    return undefined;
  }

  return { faculty: match[1], group: match[2] };
}

export function parseWeekIds(html: string): number[] {
  const ids = new Set<number>();
  const pattern = /week_id=(\d+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const id = Number(match[1]);
    if (!Number.isNaN(id)) {
      ids.add(id);
    }
  }

  return Array.from(ids).sort((a, b) => a - b);
}

function buildDate(header: string, year: number): string | undefined {
  const match = header.match(/(\d{1,2})\s+([а-я]+)/i);
  if (!match || !match[1] || !match[2]) {
    return undefined;
  }

  const month = MONTHS[match[2].toLowerCase()];
  if (!month) {
    return undefined;
  }

  return `${year}-${month}-${match[1].padStart(2, '0')}`;
}

function readTimes(cell: Element): { start: string; end: string } {
  const times = Array.from(cell.children)
    .filter((child) => child.tagName.toLowerCase() === 'span')
    .map((child) => child.textContent?.trim() ?? '')
    .filter((text) => /^\d{1,2}:\d{2}$/.test(text));
  const start = times[0] ?? '';
  const end = times[1] ?? '';
  return { start, end };
}

function isOnlineLesson(training: Element): boolean {
  if (/ЭИОС/i.test(training.textContent ?? '')) {
    return true;
  }

  return Array.from(
    training.querySelectorAll('[title], [data-original-title]'),
  ).some((element) => {
    const title =
      element.getAttribute('title') ??
      element.getAttribute('data-original-title') ??
      '';
    return /ЭИОС/i.test(title);
  });
}

export function parseLessons(
  html: string,
  options: { year: number },
): ParsedLesson[] {
  const { document } = new JSDOM(html).window;

  const table = Array.from(document.querySelectorAll('table')).find(
    (candidate) => {
      if (candidate.querySelector('.training')) {
        return true;
      }
      return Array.from(candidate.querySelectorAll('td')).some(
        (cell) => buildDate(cell.textContent ?? '', options.year) !== undefined,
      );
    },
  );
  if (!table) {
    throw new ScheduleParseError();
  }

  const lessons: ParsedLesson[] = [];
  const seen = new Set<string>();

  for (const row of Array.from(table.querySelectorAll('tr'))) {
    const cells = Array.from(row.querySelectorAll('td'));
    const headerCell = cells[0];
    if (!headerCell) {
      continue;
    }

    const date = buildDate(headerCell.textContent ?? '', options.year);
    if (!date) {
      continue;
    }

    let slotTimes: { start: string; end: string } = { start: '', end: '' };

    for (const cell of cells.slice(1)) {
      const ownTimes = readTimes(cell);
      if (ownTimes.start !== '' && ownTimes.end !== '') {
        slotTimes = ownTimes;
      }

      const training = cell.querySelector('.training');
      if (!training) {
        continue;
      }

      const lessonId =
        training
          .querySelector('[data-lesson-id]')
          ?.getAttribute('data-lesson-id') ??
        training.getAttribute('data-lesson-id') ??
        '';
      if (lessonId && seen.has(lessonId)) {
        continue;
      }
      if (lessonId) {
        seen.add(lessonId);
      }

      const disciplineEl = training.querySelector('.discipline');
      const abbr = training.querySelector('abbr[title]');
      const discipline =
        abbr?.getAttribute('title')?.trim() ||
        disciplineEl?.textContent?.trim() ||
        '';

      const kind = training.querySelector('.kind')?.textContent?.trim() ?? '';
      const auditoriums =
        training.querySelector('.auditoriums')?.textContent?.trim() ?? '';
      const room = auditoriums.length > 0 ? auditoriums : undefined;
      const online = isOnlineLesson(training);
      const { start, end } =
        ownTimes.start !== '' && ownTimes.end !== '' ? ownTimes : slotTimes;

      lessons.push({
        lessonId,
        discipline,
        kind,
        date,
        start,
        end,
        room,
        online,
      });
    }
  }

  return lessons;
}
