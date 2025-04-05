import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { handleShellCommand } from './shell-command-handler.js';

const RUN_COMMAND_DESCRIPTION = `Run shell commands in specific directories (only within allowed paths).
The "directory" parameter sets the working directory automatically; "cd" command isn't needed.`;

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
    RUN_COMMAND_DESCRIPTION,
    {
      command: z.string(),
      directory: z.string().describe(`Working directory to execute the command in.`),
    },
    async ({ command, directory }) => await handleShellCommand(command, directory)
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
