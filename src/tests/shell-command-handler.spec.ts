import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleShellCommand } from '../shell-command-handler.js';
import * as commandValidator from '../command-validator.js';

describe('handleShellCommand', () => {
  beforeEach(() => {
    // Mock validateCommandWithArgs to allow the test command
    vi.spyOn(commandValidator, 'validateCommandWithArgs').mockReturnValue(true);
    // Mock findDenyCommandInBlacklist to return null (no blacklisted commands)
    vi.spyOn(commandValidator, 'findDenyCommandInBlacklist').mockReturnValue(null);
  });
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
});
