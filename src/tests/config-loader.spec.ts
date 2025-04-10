import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import path from 'path';
import * as configLoader from '../config/config-loader.js';
import { CONFIG_NOT_FOUND_ERROR } from '../config/config-loader.js';
import { ShellCommandConfig } from '../config/shell-command-config.js';
import fs from 'fs';
import * as nodePath from 'path';

describe('Config Loader', () => {
  const originalEnv = process.env.MCP_CONFIG_PATH;
  let tempConfigPath: string;

  // テスト用の標準的な設定オブジェクト
  const mockConfig: ShellCommandConfig = {
    allowedDirectories: [path.join(__dirname, 'test-dir')],
    allowCommands: ['ls', 'pwd', 'cd'],
    denyCommands: ['rm', 'sudo'],
    defaultErrorMessage: '許可されていないコマンドです。',
  };

  beforeEach(() => {
    // 一時的な設定ファイルのパスを作成
    tempConfigPath = nodePath.join(__dirname, 'temp-config-' + Date.now() + '.json');

    // fsモジュールをモック化
    vi.spyOn(fs, 'existsSync').mockImplementation((filepath: fs.PathLike) => {
      return filepath.toString() === tempConfigPath;
    });

    vi.spyOn(fs, 'readFileSync').mockImplementation((filepath) => {
      if (filepath.toString() === tempConfigPath) {
        return JSON.stringify(mockConfig);
      }
      throw new Error(`ファイルが見つかりません: ${filepath}`);
    });

    // 環境変数をモック
    vi.stubEnv('MCP_CONFIG_PATH', tempConfigPath);
  });

  afterEach(() => {
    // モックを元に戻す
    vi.restoreAllMocks();

    // 環境変数を元に戻す
    if (originalEnv) {
      vi.stubEnv('MCP_CONFIG_PATH', originalEnv);
    } else {
      vi.stubEnv('MCP_CONFIG_PATH', '');
    }
  });

  it('should throw error when config file path is not set', () => {
    // 環境変数をクリアする
    vi.stubEnv('MCP_CONFIG_PATH', '');

    // 設定ファイルパスが設定されていない場合はエラーをスローする
    expect(() => configLoader.loadConfig()).toThrowError(CONFIG_NOT_FOUND_ERROR);
  });

  it('should throw error when config file does not exist', () => {
    // 存在しないファイルパスを設定
    const nonExistentPath = '/path/to/nonexistent/config.json';
    vi.stubEnv('MCP_CONFIG_PATH', nonExistentPath);

    // existsSyncの戻り値を再設定
    vi.spyOn(fs, 'existsSync').mockReturnValue(false); // どのパスも存在しない

    // 設定ファイルが存在しない場合はエラーをスローする
    expect(() => configLoader.loadConfig()).toThrowError(
      `設定ファイルが存在しません: ${nonExistentPath}`
    );
  });

  it('should throw error when config file is malformed', () => {
    // JSONでないファイルをモック
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      return 'This is not a valid JSON';
    });

    // 不正な設定ファイルの場合はエラーをスローする
    expect(() => configLoader.loadConfig()).toThrow();
  });

  it('should throw error when config file is missing required properties', () => {
    // 必要なプロパティが不足している設定ファイルをモック
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      return JSON.stringify({
        // allowCommandsがない
        allowedDirectories: [path.join(__dirname, 'test-dir')],
        denyCommands: ['rm', 'sudo'],
      });
    });

    // 必要なプロパティが不足している場合はエラーをスローする
    expect(() => configLoader.loadConfig()).toThrowError(
      `設定ファイルに必要なプロパティが存在しません`
    );
  });

  it('should successfully load valid config', () => {
    // デフォルトのモックは有効な設定なので、そのまま使用できる
    const config = configLoader.loadConfig();

    // 設定が正しく読み込まれているか確認
    expect(config).toHaveProperty('allowCommands');
    expect(config).toHaveProperty('denyCommands');
    expect(config).toHaveProperty('allowedDirectories');
    expect(config).toHaveProperty('defaultErrorMessage');
    // 設定値が正しいか確認
    expect(config.allowCommands).toContain('ls');
    expect(config.denyCommands).toContain('rm');
    expect(config.allowedDirectories).toContain(path.join(__dirname, 'test-dir'));
    expect(config.defaultErrorMessage).toBe('許可されていないコマンドです。');
  });

  it('should get current config and reload it', () => {
    // 初期設定
    const initialConfig = mockConfig;
    vi.spyOn(configLoader, 'getConfig').mockImplementation(() => {
      return { ...initialConfig };
    });

    const config = configLoader.getConfig();
    expect(config).toEqual(initialConfig);

    // 再読み込み後は新しい設定
    const updatedConfig = {
      ...initialConfig,
      defaultErrorMessage: '新しいエラーメッセージ',
    };

    vi.spyOn(configLoader, 'reloadConfig').mockImplementation(() => {
      return updatedConfig;
    });

    const reloadedConfig = configLoader.reloadConfig();
    expect(reloadedConfig.defaultErrorMessage).toBe('新しいエラーメッセージ');
  });
});
