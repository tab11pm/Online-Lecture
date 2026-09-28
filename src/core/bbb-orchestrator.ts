import { SdoMcpClient } from './mcp-client.js';
import { PlaywrightBbbSessionManager, BbbSession } from './bbb-session.js';
import { BbbActivityParser } from './bbb-activity-parser.js';
import type { BbbActivity, Course } from './types.js';

/**
 * BBB Target specification - either search-based or direct URL
 */
export interface BbbTarget {
  type: 'search' | 'direct';

  // If search:
  courseId?: string;
  courseName?: string;
  lectureQuery?: string;

  // If direct:
  activityUrl?: string;
}

/**
 * Result of joining a BBB session
 */
export interface BbbJoinResult {
  success: boolean;
  activityUrl: string;
  meetingUrl?: string;
  joinedAt?: Date;
  sessionDurationSeconds?: number;
  session?: BbbSession;
  error?: string;
}

/**
 * BbbOrchestrator - Coordinates SDO MCP lookup and BBB session joining
 *
 * Responsibilities:
 * - Given a target (search or direct), resolve to a BBB activity URL
 * - Fetch activity page HTML via SDO MCP
 * - Parse activity page to extract join information
 * - Coordinate with BBB session manager to join the meeting
 */
export class BbbOrchestrator {
  private sdoMcpClient: SdoMcpClient;
  private bbbSessionManager: PlaywrightBbbSessionManager;

  constructor(
    sdoMcpClient: SdoMcpClient,
    bbbSessionManager: PlaywrightBbbSessionManager
  ) {
    this.sdoMcpClient = sdoMcpClient;
    this.bbbSessionManager = bbbSessionManager;
  }

  /**
   * Join a BBB session from a target specification
   */
  async joinBbbSession(target: BbbTarget): Promise<BbbJoinResult> {
    try {
      // Resolve target to activity URL
      const activityUrl = await this.resolveActivityUrl(target);

      // Get activity page HTML
      const html = await this.getActivityPageHtml(activityUrl);

      // Parse activity page
      const parser = new BbbActivityParser(html, activityUrl);

      // Extract join URL
      const joinUrl = parser.getJoinUrl();

      // Start BBB session
      const session = await this.bbbSessionManager.startSession(activityUrl, {
        headless: false,
        skipAudioSetup: true,
        skipVideoSetup: true,
      });

      // Handle group selection if needed
      if (parser.requiresGroupSelection()) {
        await this.bbbSessionManager.selectAllGroups(session);
      }

      // Join meeting
      const joinedAt = new Date();
      await this.bbbSessionManager.joinSession(session);

      return {
        success: true,
        activityUrl,
        meetingUrl: joinUrl,
        joinedAt,
        session,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error joining BBB session';

      return {
        success: false,
        activityUrl: target.activityUrl || '',
        error: errorMessage,
      };
    }
  }

  /**
   * Monitor a session and wait for it to end
   */
  async monitorSession(session: BbbSession, timeoutMs?: number): Promise<void> {
    await this.bbbSessionManager.monitorSession(session, timeoutMs);
  }

  /**
   * Leave a session gracefully
   */
  async leaveSession(session: BbbSession): Promise<void> {
    await this.bbbSessionManager.leaveSession(session);
  }

  /**
   * Resolve a target specification to an activity URL
   */
  private async resolveActivityUrl(target: BbbTarget): Promise<string> {
    if (target.type === 'direct') {
      if (!target.activityUrl) {
        throw new Error('Direct target requires activityUrl');
      }
      return target.activityUrl;
    }

    if (target.type === 'search') {
      // Search-based resolution: use SDO MCP to find course and activity
      const courseId = target.courseId || target.courseName;
      const lectureQuery = target.lectureQuery;

      if (!courseId) {
        throw new Error('Search target requires courseId or courseName');
      }
      if (!lectureQuery) {
        throw new Error('Search target requires lectureQuery');
      }

      // TODO: Implement actual SDO MCP search when SdoMcpClient is fully implemented
      // For now, return a placeholder error
      throw new Error(
        `Search-based target resolution not yet implemented. ` +
          `Requires SDO MCP integration for course: ${courseId}, lecture: ${lectureQuery}`
      );
    }

    throw new Error(`Unknown target type: ${target.type}`);
  }

  /**
   * Get activity page HTML via SDO MCP
   */
  private async getActivityPageHtml(activityUrl: string): Promise<string> {
    // TODO: Implement actual HTML fetch when SdoMcpClient is fully integrated
    // For now, return placeholder HTML for testing
    // In real implementation, this would call:
    // return await this.sdoMcpClient.getBbbPage(activityUrl);

    // Placeholder: return mock HTML structure
    return `
      <html>
        <body>
          <div class="mod-bigbluebuttonbn">
            <h1>BigBlueButton Activity</h1>
            <p>Loading...</p>
            <a href="${activityUrl}&action=join">Join Meeting</a>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.bbbSessionManager.closeAll();
  }
}
