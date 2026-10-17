import { randomUUID } from 'node:crypto';
import { redactSensitiveText } from '@core/core/redaction.js';
import type { OnlineLectureResolution } from '@core/core/types.js';
import type { ManualTargetLookup } from '../shared/lectures.js';

export function parseManualQuery(query: string): {
  courseUrl?: string;
  courseQuery?: string;
} {
  const trimmed = query.trim();
  if (!trimmed) throw new Error('Enter a course name or SDO course URL');
  if (!/^https?:\/\//i.test(trimmed)) return { courseQuery: trimmed };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Invalid SDO course URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'sdo.tusur.ru' ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/course/view.php' ||
    url.hash ||
    [...url.searchParams.keys()].some((key) => key !== 'id') ||
    url.searchParams.getAll('id').length !== 1 ||
    !/^\d+$/.test(url.searchParams.get('id') ?? '')
  ) {
    throw new Error('Use an SDO course URL');
  }
  return { courseUrl: url.toString() };
}

/** Keeps confirmed activity URLs inside the worker until the user saves a job. */
export class ManualTargetStore {
  private readonly targets = new Map<string, { activityUrl: string; activityName: string }>();

  clear(): void {
    this.targets.clear();
  }

  get(id: string): { activityUrl: string; activityName: string } | undefined {
    return this.targets.get(id);
  }

  consume(id: string): void {
    this.targets.delete(id);
  }

  remember(result: OnlineLectureResolution, query: string): ManualTargetLookup {
    this.clear();
    if (result.status === 'not_found' || result.status === 'auth_required')
      return { status: result.status };
    const courseName = redactSensitiveText(result.status === 'resolved'
      ? result.course.name
      : /^https?:\/\//i.test(query) ? 'Курс СДО' : query.trim());
    const modules = result.status === 'resolved' ? [result.module] : result.candidates;
    const candidates = modules.map((module) => {
      const id = randomUUID();
      this.targets.set(id, {
        activityUrl: module.activityUrl,
        activityName: module.name,
      });
      return { id, name: redactSensitiveText(module.name), type: module.type, courseName };
    });
    return { status: result.status, candidates };
  }
}
