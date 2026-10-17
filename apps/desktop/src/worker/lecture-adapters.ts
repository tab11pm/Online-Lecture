import { PlaywrightBbbSessionManager } from '@core/core/bbb-session.js';
import { JobRunner } from '@core/core/job-runner.js';
import type { SdoMcpClient } from '@core/core/mcp-client.js';
import { redactSensitiveText } from '@core/core/redaction.js';
import type { JobRepository } from '@core/core/types.js';
import type { SqliteJobRepository } from '@core/persistence/job-repository.js';
import { runTimetableImport } from '@core/timetable/import-service.js';
import {
  createPlaywrightFetcher,
  type PlaywrightFetcher,
} from '@core/timetable/playwright-fetcher.js';
import type { LectureBrowserOptions } from '../shared/lectures.js';
import type { LectureAdapters } from './lecture-service.js';

export interface LectureAdaptersInput {
  authStatePath: string;
  createMcpClient(): SdoMcpClient;
}

function channelOption(browser: LectureBrowserOptions | undefined): {
  channel?: 'msedge';
} {
  return browser?.channel ? { channel: browser.channel } : {};
}

/** Window visibility is an app setting, so it overrides the stored job flag. */
function withHeadless(
  jobs: SqliteJobRepository,
  headless: boolean,
): JobRepository {
  return {
    listEnabled: () => jobs.listEnabled(),
    getById: async (id) => {
      const job = await jobs.getById(id);
      return job && { ...job, browser: { ...job.browser, headless } };
    },
    save: (job) => jobs.save(job),
  };
}

export function createLectureAdapters(
  input: LectureAdaptersInput,
): LectureAdapters {
  return {
    async resolveManualTarget(query) {
      const client = input.createMcpClient();
      try {
        return await client.resolveOnlineLecture(query);
      } finally {
        await client.close().catch(() => undefined);
      }
    },

    async runImport(jobs, onProgress, browser) {
      let fetcher: PlaywrightFetcher | undefined;
      let resolver: SdoMcpClient | undefined;
      try {
        fetcher = await createPlaywrightFetcher({
          authStatePath: input.authStatePath,
          ...channelOption(browser),
        });
        resolver = input.createMcpClient();
        return await runTimetableImport(
          { fetcher, resolver, jobs, now: () => new Date() },
          { onProgress },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { status: 'failed', message: redactSensitiveText(message) };
      } finally {
        await fetcher?.close().catch(() => undefined);
        await resolver?.close().catch(() => undefined);
      }
    },

    async runJob(jobs, runs, jobId, occurrenceId, signal, browser) {
      const bbbManager = new PlaywrightBbbSessionManager(
        channelOption(browser),
      );
      const mcpClient = input.createMcpClient();
      try {
        return await new JobRunner(
          mcpClient,
          bbbManager,
          withHeadless(jobs, browser.headless),
          runs,
        ).runJob(jobId, occurrenceId, signal);
      } finally {
        await bbbManager.closeAll().catch(() => undefined);
        await mcpClient.close().catch(() => undefined);
      }
    },
  };
}
