import fs from 'fs';
import { ShellCommandConfig, DEFAULT_CONFIG, ConfigMergeMode } from './shell-command-config.js';

/**
 * 設定ファイルを読み込む関数
 */
/**
 * 設定をデフォルト設定とマージする関数
 */
function mergeWithDefaultConfig(config: Partial<ShellCommandConfig>): ShellCommandConfig {
  return {
    // 前半はデフォルト設定、後半はカスタム設定で上書き
    allowedDirectories: [
      ...DEFAULT_CONFIG.allowedDirectories,
      ...(config.allowedDirectories || []),
    ],
    allowCommands: [...DEFAULT_CONFIG.allowCommands, ...(config.allowCommands || [])],
    denyCommands: [...DEFAULT_CONFIG.denyCommands, ...(config.denyCommands || [])],
    defaultErrorMessage: config.defaultErrorMessage || DEFAULT_CONFIG.defaultErrorMessage,
    mergeMode: config.mergeMode || DEFAULT_CONFIG.mergeMode,
  };
}

/**
 * カスタム設定でデフォルト値を上書きする関数
 */
function overwriteDefaultConfig(config: Partial<ShellCommandConfig>): ShellCommandConfig {
  return {
    // allowCommandsとdenyCommandsが設定されていればそれを使う、なければデフォルトを使う
    allowedDirectories: config.allowedDirectories || DEFAULT_CONFIG.allowedDirectories,
    allowCommands: config.allowCommands || DEFAULT_CONFIG.allowCommands,
    denyCommands: config.denyCommands || DEFAULT_CONFIG.denyCommands,
    defaultErrorMessage: config.defaultErrorMessage || DEFAULT_CONFIG.defaultErrorMessage,
    mergeMode: config.mergeMode || DEFAULT_CONFIG.mergeMode,
  };
}

export function loadConfig(): ShellCommandConfig {
  try {
    // 設定ファイルが存在するか確認
    const configPath = process.env.MCP_CONFIG_PATH;
    if (configPath && fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent) as Partial<ShellCommandConfig>;

      // マージモードに応じて処理を分岐
      const mergeMode = config.mergeMode || DEFAULT_CONFIG.mergeMode;

      if (mergeMode === ConfigMergeMode.OVERWRITE) {
        return overwriteDefaultConfig(config);
      } else {
        // デフォルトはマージモード
        return mergeWithDefaultConfig(config);
      }
    }
  } catch (error) {
    console.error(`Error loading config file: ${error}`);
  }

  // 設定ファイルがないかエラーが発生した場合はデフォルト設定を使用
  return { ...DEFAULT_CONFIG };
}

/**
 * 現在の設定を保持する変数
 */
let currentConfig = loadConfig();

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
  return currentConfig;
}
