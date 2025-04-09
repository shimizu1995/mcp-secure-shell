import { ShellCommandConfig } from './config/shell-command-config.js';
import {
  findCommandInAllowlist,
  getDenyCommandName,
  getDenyCommandMessage,
} from './utils/command-utils.js';
import { ValidationResult } from './command-validator.js';

/**
 * コマンド導入コマンドのリスト
 * xargsや-execオプションを持つfindなど、引数として他のコマンドを実行するもの
 */
export const COMMANDS_THAT_EXECUTE_OTHER_COMMANDS = ['xargs', 'find'];

/**
 * xargsコマンドから実行されるコマンドを抽出する関数
 * @param command xargsを含むコマンド文字列
 * @returns 抽出されたコマンド名（見つからない場合は空文字列）
 */
export function extractCommandFromXargs(command: string): string {
  // xargsの後の最初の引数がコマンドとみなされる
  const parts = command.trim().split(/\s+/);
  const xargsIndex = parts.findIndex((part) => part === 'xargs');

  if (xargsIndex >= 0 && xargsIndex + 1 < parts.length) {
    return parts[xargsIndex + 1];
  }

  return '';
}

/**
 * find -exec/-execdir オプションから実行されるコマンドを抽出する関数
 * @param command findコマンドを含む文字列
 * @returns 抽出されたコマンド名（見つからない場合は空文字列）
 */
export function extractCommandFromFindExec(command: string): string {
  // -exec または -execdir オプションを検索
  const execPattern = /\s+-exec(?:dir)?\s+(\S+)/;
  const match = command.match(execPattern);

  if (match && match[1]) {
    return match[1];
  }

  return '';
}

// getDenyCommandMessage moved to utils/command-utils.js

/**
 * コマンド実行コマンド（xargs, find -execなど）の判定とコマンドの抽出
 * @param baseCommand ベースコマンド
 * @param command コマンド全体
 * @param config 設定オブジェクト
 * @param result 現在の結果オブジェクト
 * @returns 検証結果、問題なければnull、問題あればValidationResult
 */
export function validateCommandExecCommand(
  baseCommand: string,
  command: string,
  config: ShellCommandConfig,
  result: ValidationResult
): ValidationResult | null {
  // 他のコマンドを実行するコマンド（xargsやfind）の場合、引数のコマンドをチェック
  let extractedCommand = '';

  if (baseCommand === 'xargs') {
    extractedCommand = extractCommandFromXargs(command);
  } else if (baseCommand === 'find' && command.includes('-exec')) {
    extractedCommand = extractCommandFromFindExec(command);
  }

  if (extractedCommand) {
    // ブラックリストチェック
    const blacklistedCmd = config.denyCommands.find((denyCmd) => {
      const cmdName = getDenyCommandName(denyCmd);
      return cmdName === extractedCommand;
    });

    if (blacklistedCmd) {
      return {
        ...result,
        message: getDenyCommandMessage(blacklistedCmd, config),
        blockReason: {
          denyCommand: blacklistedCmd,
          location: 'validateCommandWithArgs:blacklistedCommandInExec',
        },
      };
    }

    // ホワイトリストチェック
    const matchedAllowCommand = findCommandInAllowlist(extractedCommand, config.allowCommands);
    if (!matchedAllowCommand) {
      return {
        ...result,
        message: `${config.defaultErrorMessage}: ${extractedCommand} (in ${baseCommand})`,
        blockReason: {
          location: 'validateCommandWithArgs:commandInExecNotInAllowlist',
        },
      };
    }
  }

  return null;
}
