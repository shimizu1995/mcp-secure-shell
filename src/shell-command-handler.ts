import { execa } from 'execa';
import { sync as commandExistsSync } from 'command-exists';
import path from 'path';
import fs from 'fs';

// Parse allowed directories from environment variable
export function parseAllowedDirectories(): string[] {
  const allowedDirsEnv = process.env.MCP_ALLOWED_DIRECTORIES;
  if (!allowedDirsEnv) {
    return [];
  }
  return allowedDirsEnv
    .split(':')
    .map((dir) => dir.trim())
    .filter((dir) => dir.length > 0);
}

// Set of allowed directories (subdirectories of these are also allowed)
// Read from MCP_ALLOWED_DIRECTORIES environment variable
// Format: directory1:directory2:directory3
// If not set, no directories are allowed
let ALLOWED_DIRECTORIES = parseAllowedDirectories();

// For testing purposes - allows refreshing the allowed directories
export function refreshAllowedDirectories(): void {
  ALLOWED_DIRECTORIES = parseAllowedDirectories();
}

// For testing purposes - gets the current allowed directories
export function getAllowedDirectories(): string[] {
  return [...ALLOWED_DIRECTORIES];
}

// Track the current working directory
let currentWorkingDirectory = process.cwd();

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

  // その他の一般的なコマンド
  'echo',
  'date',
  'cal',

  // 開発関連コマンド
  'git',
  'npm',
]);

// Dangerous commands that should never be allowed
const BLACKLISTED_COMMANDS = [
  // File System Destruction Commands
  'rm', // Remove files/directories - Could delete critical system or user files
  'rmdir', // Remove directories - Could delete important directories
  'del', // Windows delete command - Same risks as rm

  // Disk/Filesystem Commands
  // 'format', // Formats entire disks/partitions - Could destroy all data on drives
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

  'install', // Could be used to install malicious software
  'brew',
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

/**
 * Check if a given directory is within any of the allowed directories
 */
export function isDirectoryAllowed(dir: string): boolean {
  // Resolve to absolute path
  const absoluteDir = path.resolve(dir);
  if (absoluteDir === path.sep) {
    // Root directory is not allowed
    return false;
  }

  // Check if the directory exists
  try {
    const stats = fs.statSync(absoluteDir);
    if (!stats.isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }

  // Check if it's a subdirectory of any allowed directory
  return ALLOWED_DIRECTORIES.some((allowedDir) => {
    const resolvedAllowedDir = path.resolve(allowedDir);
    return (
      absoluteDir === resolvedAllowedDir || absoluteDir.startsWith(resolvedAllowedDir + path.sep)
    );
  });
}

/**
 * Set the current working directory for command execution
 */
export function setWorkingDirectory(dir: string): string {
  if (!isDirectoryAllowed(dir)) {
    throw new Error(
      `Directory not allowed: ${dir}. Must be within: ${ALLOWED_DIRECTORIES.join(', ')}`
    );
  }

  currentWorkingDirectory = path.resolve(dir);
  return currentWorkingDirectory;
}

/**
 * Get the current working directory
 */
export function getWorkingDirectory(): string {
  return currentWorkingDirectory;
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
export async function handleShellCommand(
  command: string,
  directory?: string
): Promise<HandlerReturnType> {
  try {
    // If directory is specified, set it as the working directory
    if (directory) {
      setWorkingDirectory(directory);
    }

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
      cwd: currentWorkingDirectory, // Use the current working directory
    })`${command}`;

    return {
      content: [
        {
          type: 'text',
          text: `${result.all}`,
          mimeType: 'text/plain',
        },
        {
          type: 'text',
          text: `executed in ${currentWorkingDirectory}`,
          mimeType: 'text/plain',
        },
      ],
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
