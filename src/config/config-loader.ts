import fs from 'fs';
import { ShellCommandConfig } from './shell-command-config.js';

/**
 * 設定ファイルが見つからない場合のエラーメッセージ
 */
export const CONFIG_NOT_FOUND_ERROR =
  '設定ファイルが見つかりません。MCP_CONFIG_PATH 環境変数を設定してください。';

/**
 * 設定ファイルを読み込む関数
 */
// マージ関連の機能は現在使用していないためコメントアウト

export function loadConfig(): ShellCommandConfig {
  // 設定ファイルが存在するか確認
  const configPath = process.env.MCP_CONFIG_PATH;
  if (!configPath) {
    throw new Error(CONFIG_NOT_FOUND_ERROR);
  }

  try {
    if (!fs.existsSync(configPath)) {
      throw new Error(`設定ファイルが存在しません: ${configPath}`);
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config: ShellCommandConfig = JSON.parse(configContent);

    // 必要なプロパティが存在するか確認
    if (!config.allowCommands || !config.denyCommands || !config.allowedDirectories) {
      throw new Error(`設定ファイルに必要なプロパティが存在しません: ${configPath}`);
    }

    // デフォルト値がない場合は設定
    if (!config.defaultErrorMessage) {
      config.defaultErrorMessage = 'このコマンドは許可リストに含まれていないため実行できません';
    }

    // ノート: blockLogPathはデフォルトでは設定しない。
    // 設定ファイルで明示的に指定された場合のみログ記録を行う。

    return config;
  } catch (error) {
    console.error(`Error loading config file: ${error}`);
    throw error; // エラーを上位に伝播して処理を停止
  }
}

/**
 * 現在の設定を保持する変数
 */
let currentConfig: ShellCommandConfig | null = null;

/**
 * 設定を再読み込みする関数
 */
export function reloadConfig(): ShellCommandConfig {
  currentConfig = loadConfig();
  return currentConfig;
}

/**
 * 現在の設定を取得する関数
 */
export function getConfig(): ShellCommandConfig {
  currentConfig = currentConfig ?? loadConfig();
  return currentConfig;
}
