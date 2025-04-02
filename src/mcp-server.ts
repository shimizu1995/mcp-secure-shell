import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { handleShellCommand } from './shell-command-handler.js';

export const createMcpServer = async () => {
  // Create an MCP server
  const mcpServer = new McpServer(
    {
      name: 'whitelist-shell-server',
      version: '1.0.0',
    },
    { capabilities: { tools: {} } }
  );

  const originalError = mcpServer.server.onerror;
  mcpServer.server.onerror = (error) => {
    originalError?.(error);
    console.error('[MCP Error]', error);
  };

  mcpServer.tool(
    'run_command',
    'Run a shell command',
    { command: z.string() },
    async ({ command }) => await handleShellCommand(command)
  );

  async function cleanup() {
    try {
      await mcpServer.close();
    } catch (error) {
      console.error('Error closing server:', error);
    }
  }

  return { server: mcpServer, cleanup };
};
