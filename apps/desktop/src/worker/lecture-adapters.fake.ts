import { DateTime } from 'luxon';
import type { RunResult } from '@core/core/job-runner.js';
import { completeRun, transitionRun } from '@core/core/lifecycle.js';
import type { Job, Run } from '@core/core/types.js';
import type { LectureAdapters } from './lecture-service.js';

const FAKE_JOB_ID = 'tt:fake:demo:1';
const FUTURE_JOB_ID = 'tt:fake:future:2';
const ZONE = 'Asia/Krasnoyarsk';

function demoJob(now: Date): Job {
  const start = DateTime.fromJSDate(now, { zone: ZONE }).minus({ minutes: 1 });
  const end = start.plus({ minutes: 91 });
  return {
    id: FAKE_JOB_ID,
    enabled: true,
    source: 'timetable',
    origin: {
      faculty: 'fake',
      group: 'demo',
      discipline: 'Демонстрационная лекция',
      sdoCourseId: '1',
    },
    schedule: {
      type: 'imported',
      timezone: ZONE,
      occurrences: [
        {
          date: start.toISODate() ?? '',
          joinAt: start.toFormat('HH:mm'),
          leaveAt: end.toFormat('HH:mm'),
        },
      ],
    },
    target: {
      type: 'direct',
      activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=1',
    },
    browser: { headless: true },
  };
}

function futureJob(now: Date): Job {
  const date =
    DateTime.fromJSDate(now, { zone: ZONE }).plus({ days: 2 }).toISODate() ??
    '';
  return {
    ...demoJob(now),
    id: FUTURE_JOB_ID,
    title: 'Будущая импортированная пара',
    schedule: {
      type: 'imported',
      timezone: ZONE,
      occurrences: [{ date, joinAt: '12:00', leaveAt: '13:00' }],
    },
  };
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

/** Lecture adapters for UI work and E2E runs without TUSUR systems. */
export function createFakeLectureAdapters(now: () => Date): LectureAdapters {
  const stamp = (): string => now().toISOString();
  return {
    async resolveManualTarget() {
      return {
        status: 'resolved',
        course: { id: 'demo', name: 'Демонстрационный курс' },
        module: {
          id: 'demo-lecture',
          name: 'Демонстрационная лекция',
          type: 'lecture',
          courseUrl: 'https://sdo.tusur.ru/course/view.php?id=1',
          activityUrl: 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=1',
        },
      };
    },

    async runImport(jobs, onProgress) {
      for (const stage of [
        'group',
        'schedule',
        'courses',
        'lectures',
        'saving',
      ] as const) {
        onProgress(stage);
      }
      const today = DateTime.fromJSDate(now(), { zone: ZONE }).toISODate();
      const existing = await jobs.getById(FAKE_JOB_ID);
      const current =
        existing?.schedule.type === 'imported' &&
        existing.schedule.occurrences.some((entry) => entry.date === today);
      if (!current)
        await jobs.replaceTimetableJobs(
          process.env.ONLINE_LECTURE_FAKE_EDIT_SCENARIO === '1'
            ? [demoJob(now()), futureJob(now())]
            : [demoJob(now())],
        );
      return {
        status: 'completed',
        faculty: 'fake',
        group: 'demo',
        lessons: 1,
        complete: true,
        summary: {
          added: current ? 0 : 1,
          removed: 0,
          preservedEdits: 0,
          jobsCreated: existing ? 0 : 1,
          jobsDeleted: 0,
        },
        unresolved: [],
        ambiguous: [],
        unmapped: [],
      };
    },

    async runJob(_jobs, runs, jobId, occurrenceId, signal) {
      const result = (run: Run): RunResult => ({
        jobId,
        occurrenceId,
        status: run.status,
        ...(run.completionReason
          ? { completionReason: run.completionReason }
          : {}),
        durationSeconds: 0,
      });
      const claimed = await runs.claimScheduled(jobId, occurrenceId, stamp());
      if (!claimed) {
        const { run } = await runs.getOrCreate({
          jobId,
          occurrenceId,
          status: 'scheduled',
          createdAt: stamp(),
          updatedAt: stamp(),
        });
        return result(run);
      }
      let run = transitionRun(claimed, 'joining', stamp());
      if (process.env.ONLINE_LECTURE_FAKE_RUN_FAILURE === '1') {
        run = transitionRun(run, 'failed', stamp());
        await runs.update(run);
        return result(run);
      }
      run = transitionRun(run, 'connected', stamp());
      await runs.update(run);
      await waitForAbort(signal);
      run = transitionRun(run, 'leaving', stamp());
      await runs.update(run);
      run = completeRun(run, 'manual', stamp());
      await runs.update(run);
      return result(run);
    },
  };
}
