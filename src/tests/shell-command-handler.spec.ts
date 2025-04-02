import { describe, it, expect } from 'vitest';
import { handleShellCommand, validateCommand } from '../shell-command-handler.js';

// Do not mock the command-exists library to use the actual implementation

// Do not mock execa to test with real command execution

describe('validateCommand', () => {
  it('should return true for whitelisted commands', () => {
    expect(validateCommand('ls')).toBe(true);
    expect(validateCommand('cat')).toBe(true);
    expect(validateCommand('echo')).toBe(true);
  });

  it('should return false for non-whitelisted commands', () => {
    expect(validateCommand('rm')).toBe(false);
    expect(validateCommand('sudo')).toBe(false);
    expect(validateCommand('malicious-command')).toBe(false);
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
    const result = await handleShellCommand('sudo ls');

    // Verify error is returned
    expect(result.content[0].text).toContain('Command not allowed');
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
});
