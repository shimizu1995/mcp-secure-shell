/**
 * シェルコマンドの許可・禁止を設定するための型定義
 */

export type DenyCommand =
  | string
  | {
      command: string;
      message?: string;
    };

export type AllowCommand =
  | string
  | {
      command: string;
      subCommands?: string[];
      denySubCommands?: string[];
    };

export interface ShellCommandConfig {
  /**
   * 許可されたディレクトリのリスト
   * サブディレクトリも許可される
   */
  allowedDirectories: string[];

  allowCommands: AllowCommand[];
  denyCommands: DenyCommand[];
  defaultErrorMessage: string;
}
