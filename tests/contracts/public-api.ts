import type {
  Job,
  LectureRunner,
  Occurrence,
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

void job;
void occurrence;
void run;
void runner;
