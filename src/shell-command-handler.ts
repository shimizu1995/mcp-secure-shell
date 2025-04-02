import { execa } from 'execa';
import commandExists from 'command-exists';

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

/**
 * コマンドがホワイトリストに登録されているか検証する関数
 */
export function validateCommand(baseCommand: string): boolean {
  return WHITELISTED_COMMANDS.has(baseCommand);
}

type HandlerReturnType = {
  content: {
    type: 'text';
    text: string;
    mimeType: string;
  }[];
};

/**
 * シェルコマンドを実行するハンドラー関数
 */
export async function handleShellCommand(command: string): Promise<HandlerReturnType> {
  try {
    const baseCommand = command.trim().split(/\s+/)[0];

    // コマンドが存在するか確認
    if (!(await commandExists(baseCommand))) {
      throw new Error(`Command not found: ${baseCommand}`);
    }

    // コマンドが許可リストに含まれているか確認
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
}
