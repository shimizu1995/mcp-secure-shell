import { execa } from 'execa';
import { sync as commandExistsSync } from 'command-exists';

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

// Dangerous commands that should never be allowed
const BLACKLISTED_COMMANDS = [
  // File System Destruction Commands
  'rm', // Remove files/directories - Could delete critical system or user files
  'rmdir', // Remove directories - Could delete important directories
  'del', // Windows delete command - Same risks as rm

  // Disk/Filesystem Commands
  'format', // Formats entire disks/partitions - Could destroy all data on drives
  'mkfs', // Make filesystem - Could reformat drives and destroy data
  'dd', // Direct disk access - Can overwrite raw disks, often called "disk destroyer"

  // Permission/Ownership Commands
  'chmod', // Change file permissions - Could make critical files accessible or inaccessible
  'chown', // Change file ownership - Could transfer ownership of sensitive files

  // Privilege Escalation Commands
  'sudo', // Superuser do - Allows running commands with elevated privileges
  'su', // Switch user - Could be used to gain unauthorized user access

  // Code Execution Commands
  'exec', // Execute commands - Could run arbitrary commands with shell's privileges
  'eval', // Evaluate strings as code - Could execute malicious code injection

  // System Communication Commands
  'write', // Write to other users' terminals - Could be used for harassment/phishing
  'wall', // Write to all users - Could be used for system-wide harassment

  // System Control Commands
  'shutdown', // Shut down the system - Denial of service
  'reboot', // Restart the system - Denial of service
  'init', // System initialization control - Could disrupt system state

  // Additional High-Risk Commands
  'mkfs', // Duplicate of above, filesystem creation - Data destruction risk

  // for unit test
  'black-command-for-test', // Dummy command for testing
];

/**
 * コマンドがホワイトリストに登録されているか検証する関数
 */
export function validateCommand(baseCommand: string): boolean {
  return WHITELISTED_COMMANDS.has(baseCommand);
}

export function hasBlacklistedCommand(command: string): boolean {
  const commands = command.trim().split(/\s+/);
  for (const cmd of commands) {
    if (BLACKLISTED_COMMANDS.includes(cmd)) {
      return true;
    }
  }
  return false;
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
    const isCommandExists = await commandExistsSync(baseCommand);
    if (!isCommandExists) {
      throw new Error(`Command not found: ${baseCommand}`);
    }

    // コマンドが許可リストに含まれているか確認
    if (!validateCommand(baseCommand)) {
      throw new Error(`Command not allowed: ${baseCommand}`);
    }

    // command自体にblacklistの単語が含まれている場合は実行しない
    if (hasBlacklistedCommand(command)) {
      throw new Error(`Command contains blacklisted words: ${command}`);
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
