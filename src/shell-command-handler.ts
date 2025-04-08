import { execa } from 'execa';
import { sync as commandExistsSync } from 'command-exists';

import { validateMultipleCommands } from './command-validator.js';
import { getWorkingDirectory, setWorkingDirectory } from './directory-manager.js';
import { logBlockedCommand } from './logger.js';

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

    // Extract the base command properly handling quoted strings and special characters
    const baseCommandMatch = command.trim().match(/^(\S+)/);
    const baseCommand = baseCommandMatch ? baseCommandMatch[1] : '';

    // コマンドが存在するか確認
    const isCommandExists = await commandExistsSync(baseCommand);
    if (!isCommandExists) {
      logBlockedCommand(command, 'command not found');
      throw new Error(`Command not found: ${baseCommand}`);
    }

    // コマンドが許可リストに含まれているか確認
    // この検証は単一コマンドの検証と禁止コマンドのチェックも行う
    // validateMultipleCommandsは内部で各コマンドが許可リストに含まれているか確認する
    // また、ブラックリストのチェックも含まれている
    const validationResult = validateMultipleCommands(command);
    if (validationResult.isValid === false) {
      logBlockedCommand(command, validationResult);
      throw new Error(`${validationResult.message}\nBlocked command: ${command}`);
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
