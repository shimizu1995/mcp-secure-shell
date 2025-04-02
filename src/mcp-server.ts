import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { execa } from 'execa';
import commandExists from 'command-exists';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// ホワイトリストに登録されたコマンドのみ実行を許可する
const WHITELISTED_COMMANDS = new Set([
  // 基本的なファイル操作コマンド
  'ls',
  'dir',
  'cat',
  'more',
  'less',
  'head',
  'tail',

  // ディレクトリ操作コマンド
  'cd',
  'pwd',
  'mkdir',

  // 検索コマンド
  'find',
  'grep',
  'which',
  'whereis',

  // ファイル情報コマンド
  'file',
  'stat',
  'wc',

  // アーカイブコマンド
  'tar',
  'gzip',
  'gunzip',
  'zip',
  'unzip',

  // ネットワークコマンド
  'ping',
  'curl',
  'wget',
  'netstat',
  'ssh',
  'scp',

  // プロセス関連コマンド
  'ps',
  'top',
  'htop',

  // その他の一般的なコマンド
  'echo',
  'date',
  'cal',
  'env',
  'history',

  // 開発関連コマンド
  'git',
  'npm',
  'node',
  'python',
  'pip',
  'go',
  'cargo',
]);

// コマンドがホワイトリストに登録されているか検証する関数
function validateCommand(baseCommand: string): boolean {
  return WHITELISTED_COMMANDS.has(baseCommand);
}

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

  mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'run_command',
        description: 'Run a shell command',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string' },
          },
        },
      },
    ],
  }));

  mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'run_command') {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }
    if (typeof request.params.arguments !== 'object') {
      throw new Error(`Invalid arguments: ${request.params.arguments}`);
    }
    if (typeof request.params.arguments.command !== 'string') {
      throw new Error(`Invalid command: ${request.params.arguments.command}`);
    }
    if (request.params.arguments.command.length === 0) {
      throw new Error(`Command is empty`);
    }

    const command = request.params.arguments?.command as string;
    try {
      const baseCommand = command.trim().split(/\s+/)[0];
      if (!(await commandExists(baseCommand))) {
        throw new Error(`Command not found: ${baseCommand}`);
      }

      if (!validateCommand(baseCommand)) {
        throw new Error(`Command not allowed: ${baseCommand}`);
      }

      // コマンド実行
      const result = await execa({
        env: process.env,
        shell: true,
        all: true,
      })`${command}`;

      return {
        content: [{ type: 'text', text: result.all, mimeType: 'text/plain' }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: String(error),
            mimeType: 'text/plain',
          },
        ],
      };
    }
  });

  async function cleanup() {
    try {
      await mcpServer.close();
    } catch (error) {
      console.error('Error closing server:', error);
    }
  }

  return { server: mcpServer, cleanup };
};
