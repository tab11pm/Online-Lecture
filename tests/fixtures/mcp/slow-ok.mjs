/* global setTimeout */
// Fake SDO MCP server that answers the handshake after a short startup delay.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

await new Promise((resolve) => setTimeout(resolve, 300));
const server = new McpServer({ name: 'slow-ok', version: '0.0.0' });
await server.connect(new StdioServerTransport());
