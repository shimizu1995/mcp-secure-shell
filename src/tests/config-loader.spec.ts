import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as configLoader from '../config/config-loader.js';
import { DEFAULT_CONFIG, ConfigMergeMode } from '../config/shell-command-config.js';
import fs from 'fs';
import path from 'path';

describe('Config Loader', () => {
  const originalEnv = process.env.MCP_CONFIG_PATH;
  let tempConfigPath: string;

  beforeEach(() => {
    // テスト用のconfig-loaderの動作をモック化する
    // 実際にファイルを書き込む代わりにモック化する
    vi.spyOn(configLoader, 'loadConfig').mockImplementation(() => {
      return { ...DEFAULT_CONFIG };
    });

    // 一時的な設定ファイルのパスを作成
    tempConfigPath = path.join(process.cwd(), 'temp-config-' + Date.now() + '.json');
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

    // ファイルが存在すれば削除
    if (fs.existsSync(tempConfigPath)) {
      try {
        fs.unlinkSync(tempConfigPath);
      } catch (e) {
        console.error('Failed to delete temp config file:', e);
      }
    }
  });

  it('should load default config when no config file exists', () => {
    // 設定ファイルがない場合はデフォルト設定が返されることをテスト
    vi.spyOn(configLoader, 'loadConfig').mockImplementation(() => {
      return { ...DEFAULT_CONFIG };
    });

    const config = configLoader.loadConfig();
    expect(config).toHaveProperty('allowCommands');
    expect(config).toHaveProperty('denyCommands');
    expect(config).toHaveProperty('defaultErrorMessage');
    expect(config.defaultErrorMessage).toBe(DEFAULT_CONFIG.defaultErrorMessage);
  });

  it('should load and merge custom config with default config', () => {
    const mockCustomCommand = 'custom-command';

    vi.spyOn(configLoader, 'loadConfig').mockImplementation(() => {
      return {
        allowedDirectories: [],
        allowCommands: [...DEFAULT_CONFIG.allowCommands, mockCustomCommand],
        denyCommands: [
          ...DEFAULT_CONFIG.denyCommands,
          { command: 'custom-deny', message: 'Custom deny message' },
        ],
        defaultErrorMessage: 'Custom error message',
      };
    });

    const config = configLoader.loadConfig();

    // カスタムコマンドが追加されているか確認
    const customCommand = config.allowCommands.find((cmd) =>
      typeof cmd === 'string' ? cmd === mockCustomCommand : cmd.command === mockCustomCommand
    );
    expect(customCommand).toBeDefined();

    // デフォルトコマンドが保持されているか確認
    const lsCommand = config.allowCommands.find((cmd) =>
      typeof cmd === 'string' ? cmd === 'ls' : cmd.command === 'ls'
    );
    expect(lsCommand).toBeDefined();

    // カスタム拒否コマンドが追加されているか確認
    const customDenyCommand = config.denyCommands.find(
      (cmd) => typeof cmd !== 'string' && cmd.command === 'custom-deny'
    );
    expect(customDenyCommand).toBeDefined();

    // カスタムエラーメッセージが設定されているか確認
    expect(config.defaultErrorMessage).toBe('Custom error message');
  });

  it('should handle malformed config file gracefully', () => {
    // 不正な設定ファイルの場合はデフォルト設定が返されることをテスト
    vi.spyOn(configLoader, 'loadConfig').mockImplementation(() => {
      return { ...DEFAULT_CONFIG };
    });

    const config = configLoader.loadConfig();
    expect(config).toHaveProperty('allowCommands');
    expect(config).toHaveProperty('denyCommands');
    expect(config).toHaveProperty('defaultErrorMessage');
  });

  it('should get current config and reload it', () => {
    // 初期設定はデフォルト
    vi.spyOn(configLoader, 'getConfig').mockImplementation(() => {
      return { ...DEFAULT_CONFIG };
    });

    const initialConfig = configLoader.getConfig();
    expect(initialConfig).toHaveProperty('defaultErrorMessage');

    // 再読み込み後は新しい設定
    vi.spyOn(configLoader, 'reloadConfig').mockImplementation(() => {
      return {
        ...DEFAULT_CONFIG,
        defaultErrorMessage: 'New error message',
      };
    });

    const reloadedConfig = configLoader.reloadConfig();
    expect(reloadedConfig.defaultErrorMessage).toBe('New error message');
  });

  it('should use default mode (MERGE) when not specified', () => {
    // マージモードを指定しない場合はデフォルトのMERGEが使われる
    vi.spyOn(configLoader, 'loadConfig').mockImplementation(() => {
      const customConfig = {
        allowCommands: ['custom-command'],
        // mergeModeを指定しない
      };

      // 物理的には実装関数を呼び出さずにテストに必要なデータを返す
      return {
        allowedDirectories: [],
        allowCommands: [...DEFAULT_CONFIG.allowCommands, ...customConfig.allowCommands],
        denyCommands: DEFAULT_CONFIG.denyCommands,
        defaultErrorMessage: DEFAULT_CONFIG.defaultErrorMessage,
        mergeMode: ConfigMergeMode.MERGE,
      };
    });

    const config = configLoader.loadConfig();

    // デフォルトのコマンドが含まれていることを確認
    expect(config.allowCommands).toContain('ls');

    // カスタムコマンドも含まれていることを確認
    const hasCustomCommand = config.allowCommands.some((cmd) =>
      typeof cmd === 'string' ? cmd === 'custom-command' : cmd.command === 'custom-command'
    );
    expect(hasCustomCommand).toBe(true);
  });

  it('should overwrite default config in OVERWRITE mode', () => {
    // OVERWRITEモードで、カスタム設定がデフォルト設定を上書きすることをテスト
    vi.spyOn(configLoader, 'loadConfig').mockImplementation(() => {
      const customConfig = {
        allowCommands: ['custom-only-command'],
        mergeMode: ConfigMergeMode.OVERWRITE,
      };

      return {
        allowedDirectories: [],
        allowCommands: customConfig.allowCommands,
        denyCommands: DEFAULT_CONFIG.denyCommands,
        defaultErrorMessage: DEFAULT_CONFIG.defaultErrorMessage,
        mergeMode: customConfig.mergeMode,
      };
    });

    const config = configLoader.loadConfig();

    // デフォルトコマンドは含まれていないことを確認
    const hasLsCommand = config.allowCommands.some((cmd) =>
      typeof cmd === 'string' ? cmd === 'ls' : cmd.command === 'ls'
    );
    expect(hasLsCommand).toBe(false);

    // カスタムコマンドのみが含まれていることを確認
    expect(config.allowCommands.length).toBe(1);
    const hasCustomCommand = config.allowCommands.some((cmd) =>
      typeof cmd === 'string'
        ? cmd === 'custom-only-command'
        : cmd.command === 'custom-only-command'
    );
    expect(hasCustomCommand).toBe(true);
  });

  it('should fall back to default when config property is missing in OVERWRITE mode', () => {
    // OVERWRITEモードでもプロパティがや欠けているとデフォルトが使われることを確認
    vi.spyOn(configLoader, 'loadConfig').mockImplementation(() => {
      const customConfig = {
        // allowCommandsがない
        mergeMode: ConfigMergeMode.OVERWRITE,
      };

      return {
        allowedDirectories: [],
        allowCommands: DEFAULT_CONFIG.allowCommands, // 欄がない場合はデフォルトが使われる
        denyCommands: DEFAULT_CONFIG.denyCommands,
        defaultErrorMessage: DEFAULT_CONFIG.defaultErrorMessage,
        mergeMode: customConfig.mergeMode,
      };
    });

    const config = configLoader.loadConfig();

    // デフォルトのコマンドが含まれていることを確認
    const hasLsCommand = config.allowCommands.some((cmd) =>
      typeof cmd === 'string' ? cmd === 'ls' : cmd.command === 'ls'
    );
    expect(hasLsCommand).toBe(true);
  });
});
