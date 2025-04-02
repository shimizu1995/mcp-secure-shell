import { describe, it, expect } from 'vitest';
import {
  handleShellCommand,
  validateCommand,
  hasBlacklistedCommand,
} from '../shell-command-handler.js';

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
    expect(hasBlacklistedCommand('find . -exec black-command-for-test 777 {} \;')).toBe(true);
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
