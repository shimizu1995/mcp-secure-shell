import { execa } from 'execa';
import { sync as commandExistsSync } from 'command-exists';

import {
  validateCommandWithArgs,
  validateMultipleCommands,
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
  directory: string
): Promise<HandlerReturnType> {
  try {
    // Set the working directory
    setWorkingDirectory(directory);

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

    // 複数コマンドの場合、すべてのコマンドが許可リストに含まれているか確認
    if (!validateMultipleCommands(command)) {
      throw new Error(`One or more commands in the sequence are not allowed`);
    }

    // コマンド実行
    const result = await execa({
      env: process.env,
      shell: true,
      all: true,
      cwd: getWorkingDirectory(), // Use the current working directory
    })`${command}`;

    return {
      content: [
        {
          type: 'text',
          text: `${result.all}`,
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
