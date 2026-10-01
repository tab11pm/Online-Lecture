import { extractSdoCourseId, type CourseLink } from './course-mapper.js';
import type { ParsedLesson } from './types.js';

export interface OnlineDiscipline {
  discipline: string;
  sdoCourseId: string;
  lessons: ParsedLesson[];
}

export async function groupOnlineDisciplines(
  lessons: ParsedLesson[],
  fetchCourseLinks: (lessonId: string) => Promise<CourseLink[]>,
): Promise<{ disciplines: OnlineDiscipline[]; unresolved: ParsedLesson[] }> {
  const courseIdCache = new Map<string, string | undefined>();
  const groups = new Map<string, ParsedLesson[]>();
  const unresolved: ParsedLesson[] = [];

  for (const lesson of lessons) {
    if (!courseIdCache.has(lesson.discipline)) {
      const links = await fetchCourseLinks(lesson.lessonId);
      const first = links[0];
      courseIdCache.set(lesson.discipline, first ? extractSdoCourseId(first) : undefined);
    }

    const sdoCourseId = courseIdCache.get(lesson.discipline);

    if (sdoCourseId === undefined) {
      unresolved.push(lesson);
      continue;
    }

    const group = groups.get(lesson.discipline);
    if (group) {
      group.push(lesson);
    } else {
      groups.set(lesson.discipline, [lesson]);
    }
  }

  const disciplines: OnlineDiscipline[] = [];
  for (const [discipline, groupLessons] of groups) {
    const sdoCourseId = courseIdCache.get(discipline);
    if (sdoCourseId === undefined) continue;
    disciplines.push({ discipline, sdoCourseId, lessons: groupLessons });
  }

  return { disciplines, unresolved };
}
