export interface CourseLink {
  url: string;
  anchor: string;
  group: string;
}

function isCourseLink(value: unknown): value is CourseLink {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { url?: unknown }).url === 'string'
  );
}

export function parseCourseLinks(json: string): CourseLink[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isCourseLink).map((link) => ({
    url: link.url,
    anchor: typeof link.anchor === 'string' ? link.anchor : '',
    group: typeof link.group === 'string' ? link.group : '',
  }));
}

export function extractSdoCourseId(link: CourseLink): string | undefined {
  try {
    const id = new URL(link.url).searchParams.get('id');
    return id === null || id === '' ? undefined : id;
  } catch {
    return undefined;
  }
}

export function buildCourseUrl(sdoCourseId: string): string {
  return `https://sdo.tusur.ru/course/view.php?id=${sdoCourseId}`;
}
