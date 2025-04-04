import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { handleShellCommand } from './shell-command-handler.js';

const RUN_COMMAND_DESCRIPTION = `Run a shell command in a specified directory.
Commands are executed in the last specified directory until a new one is provided.
Only directories within allowed paths can be specified.
When specifying a directory with the "directory" parameter, you don't need to use the "cd" command as the working directory is automatically set.`;

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
      directory: z
        .string()
        .optional()
        .describe(
          'Working directory to execute the command in. Must be within allowed directories.'
        ),
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
