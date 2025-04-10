import { describe, it, expect, beforeEach, vi, afterEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getConfig } from '../config/config-loader.js';
import {
  refreshAllowedDirectories,
  getAllowedDirectoriesFromConfig,
  isDirectoryAllowed,
  setWorkingDirectory,
  getWorkingDirectory,
} from '../directory-manager.js';

describe('Directory Management', () => {
  // Use __dirname for test files and directories instead of home directory
  const testBaseDir = path.join(__dirname, 'temp-test-dir');
  const testDir = path.join(testBaseDir, 'test-dir');
  const testFile = path.join(testBaseDir, 'test-file.txt');

  // Clean up the test directories and files after all tests
  afterAll(() => {
    // Clean up test files and directories after tests
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Create test base directory if it doesn't exist
    if (!fs.existsSync(testBaseDir)) {
      fs.mkdirSync(testBaseDir, { recursive: true });
    }

    // Set up allowed directories for testing
    vi.spyOn(getConfig(), 'allowedDirectories', 'get').mockReturnValue([testBaseDir]);
    refreshAllowedDirectories();

    // Create test directory and file if they don't exist
    if (!fs.existsSync(testDir)) {
      try {
        fs.mkdirSync(testDir, { recursive: true });
      } catch {
        // Ignore errors - tests will handle this
      }
    }

    // Reset working directory to test base directory
    setWorkingDirectory(testBaseDir);

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
    // Test base directory and subdirectories should be allowed
    expect(isDirectoryAllowed(testBaseDir)).toBe(true);
    expect(isDirectoryAllowed(testDir)).toBe(true);

    // Directories outside test base directory should not be allowed
    const outsideDir = path.join(os.tmpdir(), 'test-outside');
    expect(isDirectoryAllowed(outsideDir)).toBe(false);

    // Non-directories should not be allowed
    if (fs.existsSync(testFile)) {
      expect(isDirectoryAllowed(testFile)).toBe(false);
    }

    // Non-existent directories should not be allowed
    const nonExistentDir = path.join(testBaseDir, 'non-existent-dir-' + Date.now());
    expect(isDirectoryAllowed(nonExistentDir)).toBe(false);
  });

  it('should set and get working directory', () => {
    // Set to a valid directory
    const result = setWorkingDirectory(testDir);
    expect(result).toBe(testDir);
    expect(getWorkingDirectory()).toBe(testDir);

    // Set back to test base directory
    const result2 = setWorkingDirectory(testBaseDir);
    expect(result2).toBe(testBaseDir);
    expect(getWorkingDirectory()).toBe(testBaseDir);
  });

  it('should throw an error when setting an invalid directory', () => {
    // Try to set to a directory outside allowed directories
    const outsideDir = path.join(os.tmpdir(), 'test-outside');
    expect(() => setWorkingDirectory(outsideDir)).toThrow(/Directory not allowed/);

    // Try to set to a non-existent directory
    const nonExistentDir = path.join(testBaseDir, 'non-existent-dir-' + Date.now());
    expect(() => setWorkingDirectory(nonExistentDir)).toThrow();

    // Try to set to a file (which is not a directory)
    if (fs.existsSync(testFile)) {
      expect(() => setWorkingDirectory(testFile)).toThrow();
    }
  });
});

// 設定ファイルからのALLOWED_DIRECTORIESの読み込みテスト
describe('getAllowedDirectoriesFromConfig', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return directories from config', () => {
    // Mock configuration
    vi.spyOn(getConfig(), 'allowedDirectories', 'get').mockReturnValue([
      path.join(__dirname, 'config', 'dir1'),
      path.join(__dirname, 'config', 'dir2'),
    ]);

    const result = getAllowedDirectoriesFromConfig();

    // Should include directories from config
    expect(result).toContain(path.join(__dirname, 'config', 'dir1'));
    expect(result).toContain(path.join(__dirname, 'config', 'dir2'));
    expect(result.length).toBe(2);
  });

  it('should return empty array when config is empty', () => {
    // Empty config
    vi.spyOn(getConfig(), 'allowedDirectories', 'get').mockReturnValue([]);

    const result = getAllowedDirectoriesFromConfig();

    // Should be empty
    expect(result.length).toBe(0);
  });
});

describe('handleShellCommand with Directory Parameter', () => {
  const testBaseDir = path.join(__dirname, 'temp-test-dir-2');
  const testDir = path.join(testBaseDir, 'test-dir');

  // Clean up the test directories and files after all tests
  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Create test base directory if it doesn't exist
    if (!fs.existsSync(testBaseDir)) {
      fs.mkdirSync(testBaseDir, { recursive: true });
    }

    // Set up allowed directories for testing
    vi.spyOn(getConfig(), 'allowedDirectories', 'get').mockReturnValue([testBaseDir]);
    refreshAllowedDirectories();
    // Create test directory if it doesn't exist
    if (!fs.existsSync(testDir)) {
      try {
        fs.mkdirSync(testDir, { recursive: true });
      } catch {
        // Ignore errors - tests will handle this
      }
    }

    // Reset working directory to test base directory
    setWorkingDirectory(testBaseDir);
  });

  it('should update working directory when directory parameter is used', () => {
    // Set a valid directory
    setWorkingDirectory(testDir);
    expect(getWorkingDirectory()).toBe(testDir);

    // Change back to test base directory
    setWorkingDirectory(testBaseDir);
    expect(getWorkingDirectory()).toBe(testBaseDir);
  });
});
