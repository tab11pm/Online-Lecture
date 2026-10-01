import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  Credentials,
  Session,
  Course,
  BbbActivity,
  BbbUrl,
  McpConfig,
  OnlineLectureResolution,
  OnlineLectureResolver,
} from './types.js';

/**
 * SDO MCP Client - communicates with SDO MCP server via stdio protocol
 */
export class SdoMcpClient implements OnlineLectureResolver {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private session: Session | null = null;
  private config: McpConfig;

  constructor(config: McpConfig) {
    this.config = config;
  }

  /**
   * Initialize MCP client connection
   */
  private async ensureConnected(): Promise<void> {
    if (this.client) {
      return;
    }

    this.transport = new StdioClientTransport({
      command: this.config.serverPath,
      args: [],
    });

    this.client = new Client(
      {
        name: 'online-lecture',
        version: '0.1.0',
      },
      {
        capabilities: {},
      },
    );

    await this.client.connect(this.transport);
  }

  /**
   * Authenticate with SDO using credentials
   */
  async authenticate(credentials: Credentials): Promise<Session> {
    await this.ensureConnected();

    if (!this.client) {
      throw new Error('MCP client not initialized');
    }

    try {
      const response = (await this.client.request(
        { method: 'sdo/authenticate' },
        {
          username: credentials.username,
          password: credentials.password,
        } as any,
      )) as { token: string; expiresAt: string };

      this.session = {
        token: response.token,
        expiresAt: new Date(response.expiresAt),
      };

      return this.session;
    } catch (error) {
      throw new Error(
        `SDO authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * List all available courses for the authenticated session
   */
  async listCourses(session: Session): Promise<Course[]> {
    await this.ensureConnected();

    if (!this.client) {
      throw new Error('MCP client not initialized');
    }

    this.validateSession(session);

    try {
      const response = (await this.client.request(
        { method: 'sdo/listCourses' },
        { token: session.token } as any,
      )) as { courses: Course[] };

      return response.courses;
    } catch (error) {
      throw new Error(
        `Failed to list courses: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Find BBB activity within a course by lecture name
   */
  async findBbbActivity(
    courseId: string,
    lectureName: string,
  ): Promise<BbbActivity> {
    await this.ensureConnected();

    if (!this.client) {
      throw new Error('MCP client not initialized');
    }

    if (!this.session) {
      throw new Error('Not authenticated. Call authenticate first.');
    }

    try {
      const response = (await this.client.request(
        { method: 'sdo/findBbbActivity' },
        {
          token: this.session.token,
          courseId,
          lectureName,
        } as any,
      )) as { activity: BbbActivity };

      return response.activity;
    } catch (error) {
      throw new Error(
        `Failed to find BBB activity: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get BBB URL for a specific activity
   */
  async getBbbUrl(activityId: string): Promise<BbbUrl> {
    await this.ensureConnected();

    if (!this.client) {
      throw new Error('MCP client not initialized');
    }

    if (!this.session) {
      throw new Error('Not authenticated. Call authenticate first.');
    }

    try {
      const response = (await this.client.request({ method: 'sdo/getBbbUrl' }, {
        token: this.session.token,
        activityId,
      } as any)) as BbbUrl;

      return response;
    } catch (error) {
      throw new Error(
        `Failed to get BBB URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Resolve an online lecture to a course and BBB module via the MCP server
   */
  async resolveOnlineLecture(input: {
    courseUrl?: string;
    courseQuery?: string;
    lectureQuery?: string;
  }): Promise<OnlineLectureResolution> {
    await this.ensureConnected();

    if (!this.client) {
      throw new Error('MCP client not initialized');
    }

    return (await this.client.request(
      { method: 'sdo/resolveOnlineLecture' },
      input as unknown as Parameters<Client['request']>[1],
    )) as OnlineLectureResolution;
  }

  /**
   * Get the current session if authenticated
   */
  getSession(): Session | null {
    return this.session;
  }

  /**
   * Close the MCP connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.transport = null;
      this.session = null;
    }
  }

  /**
   * Validate that session is still valid
   */
  private validateSession(session: Session): void {
    if (session.token !== this.session?.token) {
      throw new Error('Session mismatch');
    }

    if (session.expiresAt < new Date()) {
      throw new Error('Session expired');
    }
  }
}
