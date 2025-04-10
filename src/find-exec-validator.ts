import { ShellCommandConfig } from './config/shell-command-config.js';
import {
  findCommandInAllowlist,
  getDenyCommandName,
  getDenyCommandMessage,
} from './utils/command-utils.js';
import { ValidationResult } from './command-validator.js';

/**
 * find -exec/-execdir オプションから実行されるコマンドを抽出する関数
 * @param command findコマンドを含む文字列
 * @returns 抽出されたコマンド名（見つからない場合は空文字列）
 */
export function extractCommandFromFindExec(command: string): string {
  // -exec または -execdir オプションを検索
  // 正規表現を改善: -exec の後に来る実行コマンドを正確に抽出
  // -exec の後のパターンを検出し、最初の非空白文字列をコマンドとして抽出
  const execPattern = /\s+-exec(?:dir)?\s+([^\s;\\]+)/;
  const match = command.match(execPattern);

  if (match && match[1]) {
    return match[1];
  }

  return '';
}

/**
 * find -execコマンドの検証
 * @param command コマンド全体
 * @param config 設定オブジェクト
 * @param result 現在の結果オブジェクト
 * @returns 検証結果、問題なければnull、問題あればValidationResult
 */
export function validateFindExecCommand(
  command: string,
  config: ShellCommandConfig,
  result: ValidationResult
): ValidationResult | null {
  const extractedCommand = extractCommandFromFindExec(command);

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
          location: 'validateFindExecCommand:blacklistedCommandInExec',
        },
      };
    }

    // ホワイトリストチェック
    const matchedAllowCommand = findCommandInAllowlist(extractedCommand, config.allowCommands);
    if (!matchedAllowCommand) {
      return {
        ...result,
        message: `${config.defaultErrorMessage}: ${extractedCommand} (in find -exec)`,
        blockReason: {
          location: 'validateFindExecCommand:commandInExecNotInAllowlist',
        },
      };
    }
  }

  return null;
}

/**
 * findコマンド全体の特殊な処理を行う関数
 * @param commandString コマンド文字列
 * @returns 分割されたコマンドの配列
 */
export function processFindExecCommand(commandString: string): string[] {
  // &&や;で結合されたコマンドを分割
  // ここでは\;（エスケープされたセミコロン）と;（読みのセミコロン）を区別する
  const parts = [];
  let currentPart = '';
  let i = 0;

  // 文字ごとに処理して\;と通常の;を区別する
  while (i < commandString.length) {
    // 現在の文字と次の文字を取得
    const currentChar = commandString[i];
    const nextChar = i < commandString.length - 1 ? commandString[i + 1] : '';
    const prev2Chars = i >= 2 ? commandString.substring(i - 2, i) : '';

    // エスケープされたセミコロン\;の場合はそのまま追加
    if (currentChar === ';' && prev2Chars.endsWith('\\')) {
      currentPart += currentChar;
    }
    // &&演算子を検出した場合はコマンドを分割
    else if (currentChar === '&' && nextChar === '&') {
      if (currentPart.trim()) {
        parts.push(currentPart.trim());
      }
      currentPart = '';
      i++; // &&の2文字目をスキップ
    }
    // 通常のセミコロンの場合はコマンドを分割
    else if (currentChar === ';' && !prev2Chars.endsWith('\\')) {
      if (currentPart.trim()) {
        parts.push(currentPart.trim());
      }
      currentPart = '';
    }
    // 通常の文字はそのまま追加
    else {
      currentPart += currentChar;
    }

    i++;
  }

  // 最後の部分を追加
  if (currentPart.trim()) {
    parts.push(currentPart.trim());
  }

  // 特別なケースを処理する
  if (parts.length === 0 && commandString.trim()) {
    // 分割できなかった場合は全体を一つのコマンドとして追加
    return [commandString.trim()];
  }

  return parts;
}

/**
 * find -execコマンドかどうかを判定する関数
 * @param commandString コマンド文字列
 * @returns find -execコマンドの場合はtrue、それ以外の場合はfalse
 */
export function isFindExecCommand(commandString: string): boolean {
  return commandString.trim().startsWith('find') && commandString.includes('-exec');
}
