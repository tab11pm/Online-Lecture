export interface ParsedLesson {
  lessonId: string;
  discipline: string; // полное имя
  kind: string; // "Лекция"
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
  room?: string;
  online: boolean; // "реализуется в ЭИОС"
}
