import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
  Course,
  CourseModuleMatches,
  McpConfig,
  OnlineLectureResolution,
  OnlineLectureResolver,
} from './types.js';

interface RawCourse {
  title: string;
  url: string;
}

function courseIdFromUrl(url: string): string {
  try {
    return new URL(url).searchParams.get('id') ?? url;
  } catch {
    return url;
  }
}

/**
 * SDO MCP Client - communicates with the SDO MCP server via stdio protocol.
 *
 * The server authenticates through the shared Playwright storage state
 * (`SDO_AUTH_STATE_PATH`); there is no credential or token exchange.
 */
export class SdoMcpClient implements OnlineLectureResolver {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
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
      args: this.config.args ?? [],
      ...(this.config.cwd ? { cwd: this.config.cwd } : {}),
      ...(this.config.env ? { env: this.config.env } : {}),
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

  private async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    await this.ensureConnected();

    if (!this.client) {
      throw new Error('MCP client not initialized');
    }

    return (await this.client.callTool({
      name,
      arguments: args,
    })) as CallToolResult;
  }

  private static readText(name: string, result: CallToolResult): string {
    const textBlock = result.content.find(
      (block): block is { type: 'text'; text: string } =>
        block.type === 'text' && typeof block.text === 'string',
    );

    if (textBlock === undefined) {
      throw new Error(`Empty ${name} response`);
    }

    if (result.isError === true) {
      throw new Error(`${name} failed: ${textBlock.text}`);
    }

    return textBlock.text;
  }

  private async callJsonTool<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const text = SdoMcpClient.readText(name, await this.callTool(name, args));

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Invalid ${name} response`);
    }
  }

  /**
   * Check whether the locally stored SDO session is still valid
   */
  async checkSdoAuth(): Promise<boolean> {
    const result = await this.callJsonTool<{ authenticated: boolean }>(
      'check_sdo_auth',
      {},
    );

    return result.authenticated === true;
  }

  /**
   * List all courses available to the authenticated SDO session
   */
  async listCourses(): Promise<Course[]> {
    const courses = await this.callJsonTool<RawCourse[]>('list_courses', {});

    return courses.map((course) => ({
      id: courseIdFromUrl(course.url),
      name: course.title,
      url: course.url,
    }));
  }

  /**
   * Find materials or assignments on a course page by title
   */
  async findCourseModule(
    courseUrl: string,
    query: string,
  ): Promise<CourseModuleMatches> {
    return this.callJsonTool<CourseModuleMatches>('find_course_module', {
      courseUrl,
      query,
    });
  }

  /**
   * Open an assignment page in SDO and return its text
   */
  async getAssignmentDetails(assignmentUrl: string): Promise<string> {
    const result = await this.callTool('get_assignment_details', {
      assignmentUrl,
    });

    return SdoMcpClient.readText('get_assignment_details', result);
  }

  /**
   * Resolve an online lecture to a course and BBB module via the MCP server
   */
  async resolveOnlineLecture(input: {
    courseUrl?: string;
    courseQuery?: string;
    lectureQuery?: string;
  }): Promise<OnlineLectureResolution> {
    return this.callJsonTool<OnlineLectureResolution>(
      'resolve_online_lecture',
      input,
    );
  }

  /**
   * Close the MCP connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.transport = null;
    }
  }
}
