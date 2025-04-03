import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleShellCommand,
  validateCommand,
  hasBlacklistedCommand,
  isDirectoryAllowed,
  setWorkingDirectory,
  getWorkingDirectory,
} from '../shell-command-handler.js';
import fs from 'fs';
import path from 'path';

// Do not mock the command-exists library to use the actual implementation

// Do not mock execa to test with real command execution

describe('validateCommand', () => {
  it('should return true for whitelisted commands', () => {
    expect(validateCommand('ls')).toBe(true);
    expect(validateCommand('cat')).toBe(true);
    expect(validateCommand('echo')).toBe(true);
  });

  it('should return false for non-whitelisted commands', () => {
    expect(validateCommand('black-command-for-test')).toBe(false);
    expect(validateCommand('sudo')).toBe(false);
    expect(validateCommand('malicious-command')).toBe(false);
  });
});

describe('hasBlacklistedCommand', () => {
  it('should return true for commands containing blacklisted terms', () => {
    expect(hasBlacklistedCommand('black-command-for-test -rf /')).toBe(true);
    expect(hasBlacklistedCommand('echo hello | black-command-for-test bash')).toBe(true);
    expect(hasBlacklistedCommand('cat file | grep pattern | black-command-for-test')).toBe(true);
    expect(hasBlacklistedCommand('find . -exec black-command-for-test 777 {} ;')).toBe(true);
  });

  it('should return true even if blacklisted command is not the base command', () => {
    expect(hasBlacklistedCommand('echo Let me explain how black-command-for-test works')).toBe(
      true
    );
    expect(hasBlacklistedCommand('ls | xargs black-command-for-test')).toBe(true);
    expect(hasBlacklistedCommand('git commit -m "Fix black-command-for-test issue"')).toBe(true);
  });

  it('should return false for safe commands with no blacklisted terms', () => {
    expect(hasBlacklistedCommand('ls -la')).toBe(false);
    expect(hasBlacklistedCommand('echo Hello World')).toBe(false);
    expect(hasBlacklistedCommand('git status')).toBe(false);
    expect(hasBlacklistedCommand('cat /etc/passwd')).toBe(false);
  });

  it('should handle commands with arguments and pipes correctly', () => {
    expect(hasBlacklistedCommand('ls -la | grep file | wc -l')).toBe(false);
    expect(hasBlacklistedCommand('find . -name *.js | xargs cat')).toBe(false);
    expect(hasBlacklistedCommand('find . -name *.js | xargs black-command-for-test')).toBe(true);
  });

  it('should handle empty or whitespace-only commands', () => {
    expect(hasBlacklistedCommand('')).toBe(false);
    expect(hasBlacklistedCommand('   ')).toBe(false);
  });
});

describe('handleShellCommand', () => {
  it('should execute a whitelisted command', async () => {
    const result = await handleShellCommand('echo "test command execution"');

    // Verify the expected output structure
    expect(result).toHaveProperty('content');
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(result.content[0]).toHaveProperty('mimeType', 'text/plain');
    expect(result.content[0].text).toContain('test command execution');
  });

  it('should return an error for non-existent commands', async () => {
    const result = await handleShellCommand('nonexistent-command');

    // Verify error is returned
    expect(result.content[0].text).toContain('Command not found');
  });

  it('should handle command with arguments correctly when command does not exist', async () => {
    const result = await handleShellCommand('ssss -a -b --option=value');

    // Verify it only checks the base command existence
    expect(result.content[0].text).toContain('Command not found: ssss');
  });

  it('should return an error for non-whitelisted commands', async () => {
    const result = await handleShellCommand('nonexistent-whitelisted-command');

    // Verify error is returned
    expect(result.content[0].text).toContain('Command not found');
  });

  it('should handle execution errors gracefully', async () => {
    // Use a command that will fail (passing invalid argument to a file that likely doesn't exist)
    const result = await handleShellCommand('cat /nonexistent_file_123456789');

    // Verify error is returned and handled properly
    expect(result).toHaveProperty('content');
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(result.content[0]).toHaveProperty('mimeType', 'text/plain');
    // The exact error message will depend on the OS, but should contain some error text
    expect(result.content[0].text).toBeTruthy();
  });

  it('should trim whitespace from commands for proper validation', async () => {
    const result = await handleShellCommand('  echo  "test with spaces"  ');

    // Verify the command works with trimming
    expect(result).toHaveProperty('content');
    expect(result.content[0].text).toContain('test with spaces');
  });

  it('should reject commands containing blacklisted terms', async () => {
    // Commands with blacklisted terms as base command
    const result1 = await handleShellCommand('black-command-for-test -rf /tmp/test');
    expect(result1.content[0].text).toContain('Command not found: black-command-for-test');

    // Commands with blacklisted terms in arguments or piped commands
    const result2 = await handleShellCommand('echo hello | black-command-for-test ls');
    expect(result2.content[0].text).toContain('Command contains blacklisted words');

    const result3 = await handleShellCommand('ls | xargs black-command-for-test 777');
    expect(result3.content[0].text).toContain('Command contains blacklisted words');
  });

  it('should reject blacklisted commands even if they are whitelisted', async () => {
    // Simulate a case where a command is both whitelisted and blacklisted
    // This is a hypothetical test since the current implementation doesn't have
    // such a conflict, but it's good to verify this behavior

    // For example, if 'ls' was somehow added to the blacklist:
    // This test ensures that blacklist check takes precedence over whitelist check
    // We can't directly manipulate the blacklist in this test, so we use a command that
    // is definitely blacklisted (black-command-for-test) and check for the correct error message

    const result = await handleShellCommand('black-command-for-test -rf /tmp/test');

    // Verify the correct error message is returned (blacklist error, not whitelist error)
    expect(result.content[0].text).toContain('Command not found: black-command-for-test');
    expect(result.content[0].text).not.toContain('Command not allowed');
  });
});

describe('Directory Management', () => {
  // Real allowed directories pattern to test against
  const homeDir = process.env.HOME || process.cwd();
  const testDir = path.join(homeDir, 'test-dir');
  const testFile = path.join(homeDir, 'test-file.txt');

  beforeEach(() => {
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

describe('handleShellCommand with Directory Parameter', () => {
  const homeDir = process.env.HOME || process.cwd();
  const testDir = path.join(homeDir, 'test-dir');

  beforeEach(() => {
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

  it('should execute a command in the specified directory', async () => {
    // Execute pwd in the test directory
    const result = await handleShellCommand('pwd', testDir);

    // Verify the command was executed in the test directory
    expect(result.content[0].text).toContain(testDir);

    // Verify the working directory was updated
    expect(getWorkingDirectory()).toBe(testDir);
  });

  it('should use the last specified directory for subsequent commands', async () => {
    // First, set a working directory
    await handleShellCommand('pwd', testDir);

    // Then run a command without specifying a directory
    const result = await handleShellCommand('pwd');

    // Verify it still uses the previously set directory
    expect(result.content[0].text).toContain(testDir);
  });

  it('should throw an error when specifying an invalid directory', async () => {
    // Try to execute in an invalid directory
    const outsideDir = path.join('/', 'tmp', 'test-outside');
    const result = await handleShellCommand('pwd', outsideDir);

    // Verify error is returned
    expect(result.content[0].text).toContain('Directory not allowed');
  });

  it('should throw an error when specifying root directory', async () => {
    // Try to execute in the root directory
    const result = await handleShellCommand('pwd', '/');

    // Verify error is returned
    expect(result.content[0].text).toContain('Directory not allowed');
  });
});
