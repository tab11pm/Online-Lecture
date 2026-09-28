import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * Real integration test with actual SDO MCP server
 * This test verifies that we can connect to the real SDO MCP server
 * and use it to interact with SDO TUSUR
 */
describe('Real SDO MCP Integration', () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    // Start the actual SDO MCP server
    transport = new StdioClientTransport({
      command: 'npm',
      args: ['run', 'dev'],
      cwd: '/home/tabek/D/tusur/sdo_mcp',
    });

    client = new Client(
      {
        name: 'online-lecture-test',
        version: '0.1.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);
    console.log('✅ Connected to real SDO MCP server');
  }, 30000);

  afterAll(async () => {
    if (client) {
      await client.close();
    }
  });

  it('should connect to SDO MCP server', async () => {
    expect(client).toBeDefined();
  });

  it('should list courses from SDO TUSUR', async () => {
    const result = await client.callTool('list_courses', {});

    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);

    const courseText = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(courseText).toBeTruthy();
    console.log('📚 Sample courses:', courseText.substring(0, 300));
  }, 30000);

  it('should get BBB activity page structure', async () => {
    // Test with the BigBlueButton activity URL you provided
    const bbbUrl = 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=579920&group=0';

    const result = await client.callTool('get_assignment_details', {
      assignmentUrl: bbbUrl,
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].type === 'text');

    const pageText = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(pageText).toContain('bigbluebuttonbn' || 'join' || 'meeting');
    console.log('🎬 BBB page preview:', pageText.substring(0, 500));
  }, 30000);
});
