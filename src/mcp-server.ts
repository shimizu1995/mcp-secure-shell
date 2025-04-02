import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export const createMcpServer = async () => {
  // Create an MCP server
  const mcpServer = new McpServer({
    name: 'template-mcp-server',
    version: '1.0.0',
  });

  mcpServer.prompt('template', { args: z.string() }, ({ args }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `This is a template prompt with args: ${args}`,
        },
      },
    ],
  }));

  mcpServer.tool('add', { a: z.number(), b: z.number() }, async ({ a, b }) => ({
    content: [{ type: 'text', text: String(a + b) }],
  }));

  // use the following when you want to do more complex things
  // import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
  // mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => {
  //   return { tools: [] };
  // });

  async function cleanup() {
    try {
      await mcpServer.close();
    } catch (error) {
      console.error('Error closing server:', error);
    }
  }

  return { server: mcpServer, cleanup };
};
