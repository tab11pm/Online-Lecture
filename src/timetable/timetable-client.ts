import type { CourseLink } from './course-mapper.js';
import { parseCourseLinks } from './course-mapper.js';
import type { HttpFetcher } from './http-fetcher.js';
import {
  discoverMyScheduleHref,
  parseFacultyAndGroup,
  parseLessons,
  parseWeekIds,
} from './timetable-parser.js';
import type { ParsedLesson } from './types.js';

const DEFAULT_BASE_URL = 'https://timetable.tusur.ru';

export interface TimetableClientOptions {
  fetcher: HttpFetcher;
  baseUrl?: string;
  year?: number;
}

export class TimetableClient {
  private readonly fetcher: HttpFetcher;
  private readonly baseUrl: string;
  private readonly year: number;

  constructor(options: TimetableClientOptions) {
    this.fetcher = options.fetcher;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.year = options.year ?? new Date().getFullYear();
  }

  private async get(path: string): Promise<string> {
    const url = new URL(path, this.baseUrl);
    return this.fetcher.get(`${url.pathname}${url.search}`);
  }

  async discoverGroup(): Promise<{ faculty: string; group: string }> {
    const html = await this.get('/');
    const href = discoverMyScheduleHref(html);
    const parsed = href ? parseFacultyAndGroup(href) : undefined;
    if (!parsed) {
      throw new Error('Personal schedule link not found');
    }

    return parsed;
  }

  async fetchWeekIds(faculty: string, group: string): Promise<number[]> {
    const html = await this.get(groupPath(faculty, group));
    return parseWeekIds(html);
  }

  async fetchLessons(
    faculty: string,
    group: string,
    weekId: number,
  ): Promise<ParsedLesson[]> {
    const html = await this.get(
      `${groupPath(faculty, group)}?week_id=${weekId}`,
    );
    return parseLessons(html, { year: this.year });
  }

  async fetchCourseLinks(lessonId: string): Promise<CourseLink[]> {
    const json = await this.get(
      `/ocenka/api/v1/lessons/${lessonId}/course_links`,
    );
    return parseCourseLinks(json);
  }

  async fetchOnlineLessons(
    faculty: string,
    group: string,
  ): Promise<ParsedLesson[]> {
    const weekIds = await this.fetchWeekIds(faculty, group);
    const online = new Map<string, ParsedLesson>();

    for (const weekId of weekIds) {
      const lessons = await this.fetchLessons(faculty, group, weekId);
      for (const lesson of lessons) {
        if (lesson.online && !online.has(lesson.lessonId)) {
          online.set(lesson.lessonId, lesson);
        }
      }
    }

    return Array.from(online.values());
  }
}

function groupPath(faculty: string, group: string): string {
  return `/faculties/${faculty}/groups/${group}`;
}
