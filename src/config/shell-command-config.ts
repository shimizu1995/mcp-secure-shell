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

/**
 * 設定のマージモード
 */
export enum ConfigMergeMode {
  /** デフォルト設定とカスタム設定をマージする（デフォルト） */
  MERGE = 'merge',
  /** カスタム設定が存在する場合は上書きする */
  OVERWRITE = 'overwrite',
}

export interface ShellCommandConfig {
  /**
   * 許可されたディレクトリのリスト
   * サブディレクトリも許可される
   */
  allowedDirectories: string[];

  allowCommands: AllowCommand[];
  denyCommands: DenyCommand[];
  defaultErrorMessage: string;
  /**
   * 設定のマージモード
   * - merge: デフォルト設定とカスタム設定をマージする（デフォルト）
   * - overwrite: カスタム設定が存在する場合は上書きする
   */
  mergeMode?: ConfigMergeMode;
}

/**
 * コマンドが正規表現パターンかどうかを判定
 */
export function isRegexPattern(command: string): boolean {
  return command.startsWith('regex:');
}

/**
 * 正規表現パターンからRegExpオブジェクトを作成
 */
export function getRegexFromPattern(pattern: string): RegExp {
  const regexStr = pattern.substring('regex:'.length);
  return new RegExp(regexStr);
}

// デフォルト設定は削除され、ユーザーが指定した設定のみを使用します
