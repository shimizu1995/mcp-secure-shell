import { execa } from 'execa';
import { sync as commandExistsSync } from 'command-exists';
import path from 'path';
import fs from 'fs';
import { getConfig } from './config/config-loader.js';
import { isRegexPattern, getRegexFromPattern, DenyCommand } from './config/shell-command-config.js';

// Parse allowed directories from environment variable (for backward compatibility)
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

// Gets the allowed directories from config and environment variables (for backward compatibility)
export function getAllowedDirectoriesFromConfig(): string[] {
  const config = getConfig();
  // First use directories from config, then add ones from environment variables for backward compatibility
  const envDirectories = parseAllowedDirectories();
  return [...config.allowedDirectories, ...envDirectories];
}

// If not set, no directories are allowed
let ALLOWED_DIRECTORIES = getAllowedDirectoriesFromConfig();

// For testing purposes - allows refreshing the allowed directories
export function refreshAllowedDirectories(): void {
  ALLOWED_DIRECTORIES = getAllowedDirectoriesFromConfig();
}

// For testing purposes - gets the current allowed directories
export function getAllowedDirectories(): string[] {
  return [...ALLOWED_DIRECTORIES];
}

// Track the current working directory
let currentWorkingDirectory = process.cwd();

/**
 * コマンド文字列から基本コマンドを取得する
 */
function getCommandName(commandStr: string | { command: string; subCommands?: string[] }): string {
  if (typeof commandStr === 'string') {
    return commandStr;
  }
  return commandStr.command;
}

/**
 * コマンドが許可リストに登録されているか検証する関数
 */
export function validateCommand(baseCommand: string): boolean {
  const config = getConfig();

  // 許可リスト内のコマンドとマッチするか確認
  const matchedCommand = config.allowCommands.find((cmd) => {
    const cmdName = getCommandName(cmd);
    return cmdName === baseCommand;
  });

  return matchedCommand !== undefined;
}

/**
 * コマンドが許可リストに登録されているか検証する関数
 * サブコマンドも含めて検証
 */
export function validateCommandWithArgs(command: string): boolean {
  const config = getConfig();
  const parts = command.trim().split(/\s+/);
  const baseCommand = parts[0];

  // 許可リスト内のコマンドとマッチするか確認
  const matchedCommand = config.allowCommands.find((cmd) => {
    const cmdName = getCommandName(cmd);
    return cmdName === baseCommand;
  });

  // コマンドが許可リストに存在しない
  if (matchedCommand === undefined) {
    return false;
  }

  // 文字列のみの場合はすべてのサブコマンドを許可
  if (typeof matchedCommand === 'string') {
    return true;
  }

  // オブジェクト形式でsubCommandsがある場合
  if (matchedCommand.subCommands && parts.length > 1) {
    const subCommand = parts[1];
    return matchedCommand.subCommands.includes(subCommand);
  }

  // オブジェクト形式だがsubCommandsがない場合、または
  // サブコマンドが指定されていない場合は許可
  return true;
}

/**
 * DenyCommandからコマンド名を抽出
 */
function getDenyCommandName(denyCmd: DenyCommand): string {
  return typeof denyCmd === 'string' ? denyCmd : denyCmd.command;
}

/**
 * コマンドがブラックリストに含まれているかチェック
 */
export function findDenyCommandInBlacklist(command: string): DenyCommand | null {
  const config = getConfig();
  const commands = command.trim().split(/\s+/);

  // 各コマンドがブラックリストに含まれているかチェック
  for (const cmd of commands) {
    const blacklistedCmd = config.denyCommands.find((denyCmd) => {
      const cmdName = getDenyCommandName(denyCmd);
      return cmdName === cmd;
    });

    if (blacklistedCmd) {
      return blacklistedCmd;
    }
  }

  // 正規表現パターンとのマッチングをチェック
  for (const denyCmd of config.denyCommands) {
    const cmdName = getDenyCommandName(denyCmd);
    if (isRegexPattern(cmdName)) {
      const regex = getRegexFromPattern(cmdName);
      if (regex.test(command)) {
        return denyCmd;
      }
    }
  }

  return null;
}

/**
 * ブラックリストコマンドのエラーメッセージを取得
 */
export function getBlacklistErrorMessage(denyCommand: DenyCommand): string {
  if (typeof denyCommand === 'object' && denyCommand.message) {
    return denyCommand.message;
  }

  const config = getConfig();
  // デフォルトメッセージ
  return config.defaultErrorMessage;
}

/**
 * Check if a given directory is within any of the allowed directories
 */
export function isDirectoryAllowed(dir: string): boolean {
  // Resolve to absolute path
  const absoluteDir = path.resolve(dir);

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
    let isSameDirectory = false;
    if (directory) {
      const resolvedDirectory = path.resolve(directory);
      const resolvedCurrentDir = path.resolve(currentWorkingDirectory);
      isSameDirectory = resolvedDirectory === resolvedCurrentDir;

      // Even if it's the same directory, we still call setWorkingDirectory to validate
      setWorkingDirectory(directory);
    }

    const baseCommand = command.trim().split(/\s+/)[0];

    // コマンドが存在するか確認
    const isCommandExists = await commandExistsSync(baseCommand);
    if (!isCommandExists) {
      throw new Error(`Command not found: ${baseCommand}`);
    }

    // command自体にblacklistの単語が含まれている場合は実行しない
    const denyCommand = findDenyCommandInBlacklist(command);
    if (denyCommand) {
      throw new Error(getBlacklistErrorMessage(denyCommand));
    }

    // コマンドが許可リストに含まれているか確認
    if (!validateCommandWithArgs(command)) {
      throw new Error(`Command not allowed: ${baseCommand}`);
    }

    // コマンド実行
    const result = await execa({
      env: process.env,
      shell: true,
      all: true,
      cwd: currentWorkingDirectory, // Use the current working directory
    })`${command}`;

    // Prepare the response message about directory
    const dirMessage = `executed in ${currentWorkingDirectory}`;
    let additionalInfo = '';
    if (directory && isSameDirectory) {
      additionalInfo = `\n\n> **Note:** You don't need to specify the same directory as the current one.`;
    }

    return {
      content: [
        {
          type: 'text',
          text: `${result.all}`,
          mimeType: 'text/plain',
        },
        {
          type: 'text',
          text: dirMessage + additionalInfo,
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
