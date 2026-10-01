import type {
  Job,
  LectureRunner,
  Occurrence,
  OnlineLectureResolution,
  Run,
} from '../../src/core/index.js';

const job: Job = {
  id: 'math-monday',
  enabled: true,
  schedule: {
    type: 'weekly',
    days: ['mon'],
    joinAt: '10:00',
    leaveAt: '11:35',
    timezone: 'Asia/Krasnoyarsk',
  },
  target: {
    type: 'search',
    courseId: 'Математика',
    lectureQuery: 'Онлайн-лекция',
  },
  browser: { headless: false },
};

const occurrence: Occurrence = {
  id: 'math-monday:2026-09-28T10:00:00+07:00',
  jobId: job.id,
  joinAt: '2026-09-28T10:00:00+07:00',
  leaveAt: '2026-09-28T11:35:00+07:00',
  timezone: 'Asia/Krasnoyarsk',
};

const run: Run = {
  jobId: occurrence.jobId,
  occurrenceId: occurrence.id,
  status: 'scheduled',
  createdAt: occurrence.joinAt,
  updatedAt: occurrence.joinAt,
};

const runner: LectureRunner = {
  start: async () => undefined,
  stop: async () => undefined,
};

const imported: Job = {
  id: 'tt:fvs:574-1:22413',
  enabled: true,
  source: 'timetable',
  origin: {
    faculty: 'fvs',
    group: '574-1',
    discipline: 'РМП2',
    sdoCourseId: '22413',
  },
  schedule: {
    type: 'imported',
    timezone: 'Asia/Tomsk',
    occurrences: [{ date: '2026-09-30', joinAt: '13:15', leaveAt: '14:50' }],
  },
  target: { type: 'search', courseId: '22413', courseName: 'РМП2' },
  browser: { headless: true },
};

const resolution: OnlineLectureResolution = { status: 'not_found' };

void job;
void occurrence;
void run;
void runner;
void imported;
void resolution;
