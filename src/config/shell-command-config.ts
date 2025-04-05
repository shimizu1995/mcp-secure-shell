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

/**
 * デフォルトの設定を定義
 */
export const DEFAULT_CONFIG: ShellCommandConfig = {
  mergeMode: ConfigMergeMode.OVERWRITE,
  allowedDirectories: [],
  allowCommands: [
    // 基本的なファイル操作コマンド
    'ls',
    'dir',
    'cat',
    'more',
    'less',
    'head',
    'tail',

    // ディレクトリ操作コマンド
    'cd',
    'pwd',
    'mkdir',

    // 検索コマンド
    'grep',
    'which',
    'whereis',

    // ファイル情報コマンド
    'file',
    'stat',
    'wc',

    // その他の一般的なコマンド
    'echo',
    'date',
    'cal',

    // 開発関連コマンド
    {
      command: 'git',
      subCommands: [
        'status',
        'log',
        'diff',
        'grep',
        'show',
        'branch',
        'checkout',
        'fetch',
        'pull',
        'clone',
      ],
    },
    {
      command: 'npm',
      // If no subCommands is provided, all subcommands are allowed by default
      // except those listed in denySubCommands
      denySubCommands: ['install', 'uninstall', 'update', 'audit'],
    },
  ],
  denyCommands: [
    // 削除コマンド
    {
      command: 'rm',
      message:
        'rm コマンドは危険なため使用できません。代わりにゴミ箱に移動するコマンドを使用してください',
    },
    {
      command: 'rmdir',
      message: 'rmdir コマンドは危険なため使用できません。',
    },
    {
      command: 'del',
      message: 'del コマンドは危険なため使用できません。',
    },

    // ディスク・ファイルシステムコマンド
    {
      command: 'mkfs',
      message: 'mkfs コマンドはディスクの初期化に使用され、危険なため実行できません。',
    },
    {
      command: 'dd',
      message: 'dd コマンドは低レベルディスク操作のため使用できません。',
    },

    // パーミッション・所有権コマンド
    {
      command: 'chmod',
      message: 'chmod コマンドはファイルパーミッションを変更するため使用できません。',
    },
    {
      command: 'chown',
      message: 'chown コマンドはファイル所有権を変更するため使用できません。',
    },

    // 権限昇格コマンド
    {
      command: 'regex:.*sudo.*',
      message: 'sudo コマンドは権限昇格のため使用できません。',
    },
    {
      command: 'su',
      message: 'su コマンドはユーザー切り替えのため使用できません。',
    },

    // コード実行コマンド
    {
      command: 'exec',
      message: 'exec コマンドは任意のコード実行を許可するため使用できません。',
    },
    {
      command: 'eval',
      message: 'eval コマンドは任意のコード評価を許可するため使用できません。',
    },

    // システム通信コマンド
    {
      command: 'write',
      message: 'write コマンドは他のユーザーの端末に書き込むため使用できません。',
    },
    {
      command: 'wall',
      message: 'wall コマンドは全ユーザーに書き込むため使用できません。',
    },

    // システム制御コマンド
    {
      command: 'shutdown',
      message: 'shutdown コマンドはシステムをシャットダウンするため使用できません。',
    },
    {
      command: 'reboot',
      message: 'reboot コマンドはシステムを再起動するため使用できません。',
    },
    {
      command: 'init',
      message: 'init コマンドはシステム初期化制御のため使用できません。',
    },

    // その他の高リスクコマンド
    {
      command: 'install',
      message: 'install コマンドはプログラムのインストールに使用されるため許可されていません。',
    },
    {
      command: 'brew',
      message: 'brew コマンドはパッケージ管理に使用されるため許可されていません。',
    },

    // findコマンドを制限し、git grepを推奨
    {
      command: 'find',
      message: 'find コマンドではなく、git grep を使用してください。',
    },

    // テスト用ダミーコマンド
    {
      command: 'black-command-for-test',
      message: 'このコマンドはテスト用のブラックリストコマンドです。',
    },
  ],
  defaultErrorMessage:
    'このコマンドは許可リストに含まれていないため実行できません。システム管理者に連絡してください。',
};
