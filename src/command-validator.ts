import { getConfig } from './config/config-loader.js';
import { isRegexPattern, getRegexFromPattern, DenyCommand } from './config/shell-command-config.js';

/**
 * コマンド文字列から基本コマンドを取得する
 */
export function getCommandName(
  commandStr: string | { command: string; subCommands?: string[] }
): string {
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
 * コマンド導入コマンドのリスト
 * xargsや-execオプションを持つfindなど、引数として他のコマンドを実行するもの
 */
const COMMANDS_THAT_EXECUTE_OTHER_COMMANDS = ['xargs', 'find'];

/**
 * コマンドがブラックリストに含まれているかチェック
 */
export function findDenyCommandInBlacklist(command: string): DenyCommand | null {
  const config = getConfig();
  const trimmedCommand = command.trim();

  // 正規表現パターンとのマッチングをチェック（コマンド全体を対象）
  for (const denyCmd of config.denyCommands) {
    const cmdName = getDenyCommandName(denyCmd);
    if (isRegexPattern(cmdName)) {
      const regex = getRegexFromPattern(cmdName);
      if (regex.test(trimmedCommand)) {
        return denyCmd;
      }
    }
  }

  // コマンドを実行可能な単位で分割してチェック
  // パイプやセミコロンで分割された個々のコマンドを処理
  const commandParts = trimmedCommand.split(/[|;]/);

  for (const part of commandParts) {
    const trimmedPart = part.trim();
    if (!trimmedPart) continue;

    // 各部分の基本コマンドを取得（最初の単語）
    const partWords = trimmedPart.split(/\s+/);
    const baseCommand = partWords[0];

    // 基本コマンドがブラックリストに含まれているかチェック
    const blacklistedCmd = config.denyCommands.find((denyCmd) => {
      const cmdName = getDenyCommandName(denyCmd);
      return !isRegexPattern(cmdName) && cmdName === baseCommand;
    });

    if (blacklistedCmd) {
      return blacklistedCmd;
    }

    // 他のコマンドを実行するコマンド（xargsなど）の場合、引数もチェック
    if (COMMANDS_THAT_EXECUTE_OTHER_COMMANDS.includes(baseCommand)) {
      // 引数として渡されるコマンドがブラックリストに含まれているかチェック
      for (let i = 1; i < partWords.length; i++) {
        const arg = partWords[i];
        const blacklistedArg = config.denyCommands.find((denyCmd) => {
          const cmdName = getDenyCommandName(denyCmd);
          return !isRegexPattern(cmdName) && cmdName === arg;
        });

        if (blacklistedArg) {
          return blacklistedArg;
        }
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
