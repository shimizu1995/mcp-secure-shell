import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getConfig } from '../config/config-loader.js';
import {
  parseAllowedDirectories,
  refreshAllowedDirectories,
  getAllowedDirectoriesFromConfig,
  isDirectoryAllowed,
  setWorkingDirectory,
  getWorkingDirectory,
} from '../directory-manager.js';

describe('Directory Management', () => {
  // Real allowed directories pattern to test against
  const homeDir = process.env.HOME || process.cwd();
  const testDir = path.join(homeDir, 'test-dir');
  const testFile = path.join(homeDir, 'test-file.txt');

  beforeEach(() => {
    // Set up allowed directories for testing
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', homeDir);
    refreshAllowedDirectories();
    // Create test directory and file if they don't exist
    if (!fs.existsSync(testDir)) {
      try {
        fs.mkdirSync(testDir, { recursive: true });
      } catch {
        // Ignore errors - tests will handle this
      }
    }

    // Reset working directory to home directory
    setWorkingDirectory(homeDir);

    // Create test file if it doesn't exist
    if (!fs.existsSync(testFile)) {
      try {
        fs.writeFileSync(testFile, 'test content', 'utf8');
      } catch {
        // Ignore errors - tests will handle this
      }
    }
  });

  it('should validate if a directory is allowed', () => {
    // Home directory and subdirectories should be allowed
    expect(isDirectoryAllowed(homeDir)).toBe(true);
    expect(isDirectoryAllowed(testDir)).toBe(true);

    // Directories outside home should not be allowed
    const outsideDir = path.join('/', 'tmp', 'test-outside');
    expect(isDirectoryAllowed(outsideDir)).toBe(false);

    // Non-directories should not be allowed
    if (fs.existsSync(testFile)) {
      expect(isDirectoryAllowed(testFile)).toBe(false);
    }

    // Non-existent directories should not be allowed
    const nonExistentDir = path.join(homeDir, 'non-existent-dir-' + Date.now());
    expect(isDirectoryAllowed(nonExistentDir)).toBe(false);
  });

  it('should set and get working directory', () => {
    // Set to a valid directory
    const result = setWorkingDirectory(testDir);
    expect(result).toBe(testDir);
    expect(getWorkingDirectory()).toBe(testDir);

    // Set back to home directory
    const result2 = setWorkingDirectory(homeDir);
    expect(result2).toBe(homeDir);
    expect(getWorkingDirectory()).toBe(homeDir);
  });

  it('should throw an error when setting an invalid directory', () => {
    // Try to set to a directory outside allowed directories
    const outsideDir = path.join('/', 'tmp', 'test-outside');
    expect(() => setWorkingDirectory(outsideDir)).toThrow(/Directory not allowed/);

    // Try to set to a non-existent directory
    const nonExistentDir = path.join(homeDir, 'non-existent-dir-' + Date.now());
    expect(() => setWorkingDirectory(nonExistentDir)).toThrow();

    // Try to set to a file (which is not a directory)
    if (fs.existsSync(testFile)) {
      expect(() => setWorkingDirectory(testFile)).toThrow();
    }
  });
});

// ALLOWED_DIRECTORIESの環境変数からの読み込みテスト
describe('getAllowedDirectoriesFromConfig', () => {
  // 環境変数のモックを管理するために、afterEachフックを追加
  afterEach(() => {
    // 環境変数のモックをリセット
    vi.unstubAllEnvs();
  });

  it('should merge directories from config and environment variables', () => {
    // Mock configuration
    vi.spyOn(getConfig(), 'allowedDirectories', 'get').mockReturnValue([
      '/config/dir1',
      '/config/dir2',
    ]);
    // Mock environment variable
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', '/env/dir1:/env/dir2');

    const result = getAllowedDirectoriesFromConfig();

    // Should include directories from both sources
    expect(result).toContain('/config/dir1');
    expect(result).toContain('/config/dir2');
    expect(result).toContain('/env/dir1');
    expect(result).toContain('/env/dir2');
    expect(result.length).toBe(4);
  });

  it('should work with only config directories', () => {
    // Mock configuration
    vi.spyOn(getConfig(), 'allowedDirectories', 'get').mockReturnValue([
      '/config/dir1',
      '/config/dir2',
    ]);
    // Empty environment variable
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', '');

    const result = getAllowedDirectoriesFromConfig();

    // Should include only config directories
    expect(result).toContain('/config/dir1');
    expect(result).toContain('/config/dir2');
    expect(result.length).toBe(2);
  });

  it('should work with only environment variable directories', () => {
    // Empty config
    vi.spyOn(getConfig(), 'allowedDirectories', 'get').mockReturnValue([]);
    // Mock environment variable
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', '/env/dir1:/env/dir2');

    const result = getAllowedDirectoriesFromConfig();

    // Should include only environment variable directories
    expect(result).toContain('/env/dir1');
    expect(result).toContain('/env/dir2');
    expect(result.length).toBe(2);
  });

  it('should return empty array when both sources are empty', () => {
    // Empty config
    vi.spyOn(getConfig(), 'allowedDirectories', 'get').mockReturnValue([]);
    // Empty environment variable
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', '');

    const result = getAllowedDirectoriesFromConfig();

    // Should be empty
    expect(result.length).toBe(0);
  });
});

describe('parseAllowedDirectories', () => {
  // 環境変数のモックを管理するために、afterEachフックを追加
  afterEach(() => {
    // 環境変数のモックをリセット
    vi.unstubAllEnvs();
  });

  // 各テスト後に環境変数の変更をALLOWED_DIRECTORIESに反映させる
  beforeEach(() => {
    // 現在の環境変数を保存
    refreshAllowedDirectories();
  });

  it('should return empty array when environment variable is not set', () => {
    // 環境変数が存在しない場合
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', undefined);
    expect(parseAllowedDirectories()).toEqual([]);
  });

  it('should return empty array when environment variable is empty', () => {
    // 環境変数が空文字列の場合
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', '');
    expect(parseAllowedDirectories()).toEqual([]);
  });

  it('should parse colon-separated directories', () => {
    // 標準的なケース: コロン区切りのディレクトリリスト
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', '/home/user:/tmp:/var/log');
    expect(parseAllowedDirectories()).toEqual(['/home/user', '/tmp', '/var/log']);
  });

  it('should filter out empty entries', () => {
    // 空のエントリを含むケース
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', '/home/user::/tmp::/var/log');
    expect(parseAllowedDirectories()).toEqual(['/home/user', '/tmp', '/var/log']);
  });

  it('should handle single directory', () => {
    // ディレクトリが1つだけのケース
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', '/home/user');
    expect(parseAllowedDirectories()).toEqual(['/home/user']);
  });

  it('should trim whitespace from directories', () => {
    // 空白を含むケース
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', ' /home/user : /tmp : /var/log ');
    expect(parseAllowedDirectories()).toEqual(['/home/user', '/tmp', '/var/log']);
  });
});

describe('handleShellCommand with Directory Parameter', () => {
  const homeDir = process.env.HOME || process.cwd();
  const testDir = path.join(homeDir, 'test-dir');

  beforeEach(() => {
    // Set up allowed directories for testing
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', homeDir);
    refreshAllowedDirectories();
    // Create test directory if it doesn't exist
    if (!fs.existsSync(testDir)) {
      try {
        fs.mkdirSync(testDir, { recursive: true });
      } catch {
        // Ignore errors - tests will handle this
      }
    }

    // Reset working directory to home directory
    setWorkingDirectory(homeDir);
  });

  it('should update working directory when directory parameter is used', () => {
    // Set a valid directory
    setWorkingDirectory(testDir);
    expect(getWorkingDirectory()).toBe(testDir);

    // Change back to home directory
    setWorkingDirectory(homeDir);
    expect(getWorkingDirectory()).toBe(homeDir);
  });
});
