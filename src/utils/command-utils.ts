import { AllowCommand, DenyCommand, ShellCommandConfig } from '../config/shell-command-config.js';

/**
 * コマンド文字列またはオブジェクトからコマンド名を取得する
 * @param commandStr コマンド文字列またはコマンドオブジェクト
 * @returns コマンド名
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
 * コマンドが許可リストに含まれているか確認する関数
 * @param commandName 確認するコマンド名
 * @param allowCommands 許可コマンドリスト
 * @returns マッチした許可コマンド、見つからない場合はnull
 */
export function findCommandInAllowlist(
  commandName: string,
  allowCommands: AllowCommand[]
): AllowCommand | null {
  const matchedCommand = allowCommands.find((cmd) => {
    const cmdName = getCommandName(cmd);
    return cmdName === commandName;
  });

  return matchedCommand || null;
}

/**
 * DenyCommandからコマンド名を抽出する関数
 * @param denyCmd 拒否コマンド
 * @returns コマンド名
 */
export function getDenyCommandName(denyCmd: DenyCommand): string {
  return typeof denyCmd === 'string' ? denyCmd : denyCmd.command;
}

/**
 * DenyCommandからエラーメッセージを取得する関数
 * @param denyCommand 拒否コマンド
 * @param config 設定オブジェクト
 * @returns エラーメッセージ
 */
export function getDenyCommandMessage(
  denyCommand: DenyCommand,
  config: ShellCommandConfig
): string {
  if (typeof denyCommand === 'object' && denyCommand.message) {
    return denyCommand.message;
  }
  return config.defaultErrorMessage;
}
