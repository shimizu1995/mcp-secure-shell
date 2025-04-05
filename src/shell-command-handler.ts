import { execa } from 'execa';
import { sync as commandExistsSync } from 'command-exists';
import path from 'path';

import {
  validateCommandWithArgs,
  findDenyCommandInBlacklist,
  getBlacklistErrorMessage,
} from './command-validator.js';
import { getWorkingDirectory, setWorkingDirectory } from './directory-manager.js';

// No re-exports - functions should be imported directly from their respective modules

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
    let isUsingCdCommand = false;

    if (directory) {
      const resolvedDirectory = path.resolve(directory);
      const resolvedCurrentDir = path.resolve(getWorkingDirectory());
      isSameDirectory = resolvedDirectory === resolvedCurrentDir;

      // Check if the command starts with 'cd'
      const trimmedCommand = command.trim();
      isUsingCdCommand = trimmedCommand.startsWith('cd ') || trimmedCommand === 'cd';

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
      cwd: getWorkingDirectory(), // Use the current working directory
    })`${command}`;

    // Prepare the response message about directory
    const dirMessage = `executed in ${getWorkingDirectory()}`;
    let additionalInfo = '';

    if (directory && isSameDirectory) {
      additionalInfo = `\n\n> **Note:** You don't need to specify the same directory as the current one.`;
    }

    if (directory && isUsingCdCommand) {
      additionalInfo += `\n\n> **Note:** When specifying a directory with the 'directory' parameter, you don't need to use the 'cd' command. The 'directory' parameter already sets the working directory for the command.`;
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
