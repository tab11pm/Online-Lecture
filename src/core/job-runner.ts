import { redactSensitiveText } from './redaction.js';
import type {
  Job,
  Occurrence,
  Run,
  RunStatus,
  CompletionReason,
  JobRepository,
  RunRepository,
  Credentials,
  SessionConfig,
  BbbSession,
  SessionState,
} from './types.js';
import type { SdoMcpClient } from './mcp-client.js';
import type { PlaywrightBbbSessionManager } from './bbb-session.js';

/**
 * Result of running a job
 */
export interface RunResult {
  jobId: string;
  occurrenceId: string;
  status: RunStatus;
  completionReason?: CompletionReason;
  bbbUrl?: string;
  error?: string;
  durationSeconds: number;
}

/**
 * Coordinates job execution: MCP client + BBB session manager
 */
export class JobRunner {
  constructor(
    private mcpClient: SdoMcpClient,
    private bbbManager: PlaywrightBbbSessionManager,
    private jobRepo: JobRepository,
    private runRepo: RunRepository
  ) {}

  /**
   * Run a complete job: get URL → join BBB → monitor → leave
   */
  async runJob(
    jobId: string,
    occurrenceId: string,
    credentials?: Credentials
  ): Promise<RunResult> {
    const startTime = Date.now();
    const result: RunResult = {
      jobId,
      occurrenceId,
      status: 'scheduled',
      durationSeconds: 0,
    };

    try {
      // Load job configuration
      const job = await this.jobRepo.getById(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      // Get or create run record
      const { run: dbRun } = await this.runRepo.getOrCreate({
        jobId,
        occurrenceId,
        status: 'resolving',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Resolve BBB URL
      let bbbUrl = '';

      if (job.target.type === 'url') {
        // Direct URL target
        bbbUrl = job.target.url;
        result.status = 'joining';
        dbRun.status = 'joining';
      } else if (job.target.type === 'search' && credentials) {
        // Search for URL via MCP
        result.status = 'resolving';
        dbRun.status = 'resolving';

        try {
          const session = await this.mcpClient.authenticate(credentials);

          const activity = await this.mcpClient.findBbbActivity(
            job.target.course,
            job.target.lecture || 'Lecture'
          );

          const bbbUrlObj = await this.mcpClient.getBbbUrl(activity.id);
          bbbUrl = bbbUrlObj.url;

          await this.mcpClient.close();
        } catch (error) {
          throw new Error(
            `Failed to resolve URL via MCP: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }

        result.status = 'joining';
        dbRun.status = 'joining';
      } else {
        throw new Error(
          'Cannot resolve target: URL type requires direct URL, search type requires credentials'
        );
      }

      result.bbbUrl = redactSensitiveText(bbbUrl);
      await this.runRepo.update(dbRun);

      // Start BBB session
      const sessionConfig: SessionConfig = {
        headless: job.browser.headless,
        timeout: 30000,
        joinTimeout: 10000,
      };

      let session: BbbSession | null = null;

      try {
        session = await this.bbbManager.startSession(bbbUrl, sessionConfig);

        // Join as listener
        result.status = 'joining';
        dbRun.status = 'joining';
        await this.runRepo.update(dbRun);

        await this.bbbManager.joinAsListener(session);

        // Monitor session
        result.status = 'connected';
        dbRun.status = 'connected';
        await this.runRepo.update(dbRun);

        // Simple monitoring: wait for session to end or timeout
        let isStillConnected = true;
        const monitorStartTime = Date.now();
        const maxMonitorTime = 4 * 60 * 60 * 1000; // 4 hours max

        while (
          isStillConnected &&
          Date.now() - monitorStartTime < maxMonitorTime
        ) {
          try {
            const state: SessionState =
              await this.bbbManager.monitorSession(session);
            isStillConnected = state.isConnected;

            if (!isStillConnected) {
              result.completionReason = 'meeting_ended';
            }
          } catch (error) {
            // Error during monitoring might mean session ended
            result.completionReason = 'error';
            isStillConnected = false;
          }

          // Check every 30 seconds
          if (isStillConnected) {
            await new Promise((resolve) => setTimeout(resolve, 30000));
          }
        }

        if (Date.now() - monitorStartTime >= maxMonitorTime) {
          result.completionReason = 'deadline';
        }
      } catch (error) {
        result.status = 'failed';
        result.error = redactSensitiveText(
          error instanceof Error ? error.message : 'Unknown error'
        );
        result.completionReason = 'error';
      } finally {
        // Always leave session
        if (session) {
          try {
            result.status = 'leaving';
            dbRun.status = 'leaving';
            await this.runRepo.update(dbRun);

            await this.bbbManager.leaveSession(session);
          } catch (error) {
            console.warn(
              `Warning while leaving session: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }
      }

      // Final status
      if (result.status !== 'failed') {
        result.status = 'completed';
      }
      dbRun.status = result.status as RunStatus;
      dbRun.completionReason = result.completionReason;
      dbRun.updatedAt = new Date().toISOString();

      await this.runRepo.update(dbRun);
    } catch (error) {
      result.status = 'failed';
      result.error = redactSensitiveText(
        error instanceof Error ? error.message : 'Unknown error'
      );
      result.completionReason = 'error';

      // Try to update run repo even on failure
      try {
        const { run: dbRun } = await this.runRepo.getOrCreate({
          jobId,
          occurrenceId,
          status: 'failed',
          completionReason: 'error',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        dbRun.status = 'failed';
        dbRun.completionReason = 'error';
        await this.runRepo.update(dbRun);
      } catch (e) {
        // Ignore secondary errors
      }
    }

    result.durationSeconds = (Date.now() - startTime) / 1000;
    return result;
  }
}