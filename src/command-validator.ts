import { getConfig } from './config/config-loader.js';
import { DenyCommand } from './config/shell-command-config.js';

// シェル演算子の正規表現パターン
const SHELL_OPERATORS_REGEX = /([;|&]|&&|\|\||\(|\)|\{|\})/g;

// コマンド置換の正規表現パターン
const COMMAND_SUBSTITUTION_REGEX = /\$\([^)]+\)/g;

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

  // サブコマンドが指定されている場合の処理
  if (parts.length > 1) {
    const subCommand = parts[1];

    // denySubCommands が指定されている場合、そのリストに含まれるサブコマンドは拒否
    if (matchedCommand.denySubCommands && matchedCommand.denySubCommands.includes(subCommand)) {
      return false;
    }

    // subCommands が指定されている場合、そのリストに含まれるサブコマンドのみ許可
    if (matchedCommand.subCommands) {
      return matchedCommand.subCommands.includes(subCommand);
    }
  }

  // サブコマンドが指定されていない場合、またはsubCommandsとdenySubCommandsのどちらも
  // 指定されていない場合は許可
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
      return cmdName === baseCommand;
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
          return cmdName === arg;
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

/**
 * 複数のコマンドが組み合わされた文字列から個々のコマンドを抽出する
 * 例: "ls -la; cat file | grep pattern && echo done"
 */
export function extractCommands(commandString: string): string[] {
  // 結果のコマンドリスト
  const commands: string[] = [];

  // コマンド置換を検出して処理
  const substitutions = commandString.match(COMMAND_SUBSTITUTION_REGEX) || [];

  // コマンド置換内のコマンドを抽出
  substitutions.forEach((subst) => {
    // $() 内のコマンドを抽出
    const innerCommand = subst.substring(2, subst.length - 1).trim();
    if (innerCommand) {
      // 再帰的にコマンド置換内のコマンドも処理
      const innerCommands = extractCommands(innerCommand);
      commands.push(...innerCommands);
    }
  });

  // 元のコマンド文字列からコマンド置換部分を一時的に除去
  let processedCommand = commandString;
  substitutions.forEach((subst, index) => {
    processedCommand = processedCommand.replace(subst, `__SUBST${index}__`);
  });

  // シェル演算子で分割
  const parts = processedCommand
    .split(SHELL_OPERATORS_REGEX)
    .filter(Boolean)
    .map((part) => part.trim());

  // 演算子ではない部分（実際のコマンド）だけを取得
  const basicCommands = parts.filter((part) => {
    return !part.match(/^([;|&]|&&|\|\||\(|\)|\{|\})$/) && !part.match(/^__SUBST\d+__$/); // 置換されたパターンは除外
  });

  // 分割されたコマンドを追加
  commands.push(...basicCommands);

  return commands.filter(Boolean);
}

/**
 * 複数のコマンドを含むコマンド文字列が全て許可リストに含まれているか検証
 */
export function validateMultipleCommands(commandString: string): boolean {
  // 個々のコマンドを抽出
  const commands = extractCommands(commandString);

  // 特殊な判定が必要なコマンドを除外
  const commandsToCheck = commands.filter((cmd) => {
    // オリジナルのコマンド文字列は除外する
    if (cmd === commandString.trim()) {
      return false;
    }
    // 中括弧{}()のケースは除外する
    if (cmd.startsWith('{ ') || cmd.startsWith('(')) {
      return false;
    }
    return true;
  });

  // 各コマンドが許可リストに含まれているか検証
  return commandsToCheck.every((cmd) => validateCommandWithArgs(cmd));
}
