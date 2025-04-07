import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleShellCommand } from '../shell-command-handler.js';
import * as commandValidator from '../command-validator.js';
import * as directoryManager from '../directory-manager.js';
import * as logger from '../logger.js';

describe('handleShellCommand', () => {
  beforeEach(() => {
    // Mock validateMultipleCommands to allow multiple commands by default
    vi.spyOn(commandValidator, 'validateMultipleCommands').mockReturnValue({
      isValid: true,
      message: '',
      command: '',
      baseCommand: '',
    });
    // Mock isDirectoryAllowed to return true for the test directory
    vi.spyOn(directoryManager, 'isDirectoryAllowed').mockReturnValue(true);
    // Mock setWorkingDirectory to prevent errors
    vi.spyOn(directoryManager, 'setWorkingDirectory').mockImplementation((dir) => dir);
    // Mock logBlockedCommand to prevent actual logging during tests
    vi.spyOn(logger, 'logBlockedCommand').mockImplementation(() => {});
  });
  it('should execute an allowed command', async () => {
    // Use a test directory path that will be allowed by our mock
    const testDir = '/test-dir';
    // Make sure working directory is mocked correctly
    vi.spyOn(directoryManager, 'getWorkingDirectory').mockReturnValue(testDir);

    const result = await handleShellCommand('echo "test command execution"', testDir);

    // Verify the expected output structure
    expect(result).toHaveProperty('content');
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(result.content[0]).toHaveProperty('mimeType', 'text/plain');
    expect(result.content[0].text).toContain('test command execution');
  });

  it('should return an error for non-existent commands and log them', async () => {
    // Use a test directory path that will be allowed by our mock
    const testDir = '/test-dir';
    // Make sure working directory is mocked correctly
    vi.spyOn(directoryManager, 'getWorkingDirectory').mockReturnValue(testDir);
    // Spy on the logBlockedCommand function
    const logSpy = vi.spyOn(logger, 'logBlockedCommand');

    const result = await handleShellCommand('nonexistent-command', testDir);

    // Verify error is returned
    expect(result.content[0].text).toContain('Command not found');
    // Verify the logger was called with the correct arguments
    expect(logSpy).toHaveBeenCalledWith(
      'nonexistent-command',
      expect.stringContaining('Command not found')
    );
  });

  it('should handle command with arguments correctly when command does not exist', async () => {
    // Use a test directory path that will be allowed by our mock
    const testDir = '/test-dir';
    // Make sure working directory is mocked correctly
    vi.spyOn(directoryManager, 'getWorkingDirectory').mockReturnValue(testDir);

    const result = await handleShellCommand('ssss -a -b --option=value', testDir);

    // Verify it only checks the base command existence
    expect(result.content[0].text).toContain('Command not found: ssss');
  });

  it('should handle execution errors gracefully', async () => {
    // Use a command that will fail (passing invalid argument to a file that likely doesn't exist)
    // Use a test directory path that will be allowed by our mock
    const testDir = '/test-dir';
    // Make sure working directory is mocked correctly
    vi.spyOn(directoryManager, 'getWorkingDirectory').mockReturnValue(testDir);

    const result = await handleShellCommand('cat /nonexistent_file_123456789', testDir);

    // Verify error is returned and handled properly
    expect(result).toHaveProperty('content');
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(result.content[0]).toHaveProperty('mimeType', 'text/plain');
    // The exact error message will depend on the OS, but should contain some error text
    expect(result.content[0].text).toBeTruthy();
  });

  it('should execute valid multi-command inputs', async () => {
    // Use a test directory path that will be allowed by our mock
    const testDir = '/test-dir';
    // Make sure working directory is mocked correctly
    vi.spyOn(directoryManager, 'getWorkingDirectory').mockReturnValue(testDir);

    const result = await handleShellCommand('echo "first" && echo "second"', testDir);

    // Verify we get the expected output
    expect(result).toHaveProperty('content');
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(result.content[0].text).toContain('first');
    expect(result.content[0].text).toContain('second');
  });

  it('should reject disallowed commands in multi-command sequences and log them', async () => {
    // Use a test directory path that will be allowed by our mock
    const testDir = '/test-dir';
    // Mock validateMultipleCommands to reject this command
    vi.spyOn(commandValidator, 'validateMultipleCommands').mockReturnValue({
      isValid: false,
      message: 'One or more commands in the sequence are not allowed',
      command: 'forbidden-command',
      baseCommand: 'forbidden-command',
    });
    // Spy on the logBlockedCommand function
    const logSpy = vi.spyOn(logger, 'logBlockedCommand');

    const command = 'echo "first" && forbidden-command';
    const result = await handleShellCommand(command, testDir);

    // Verify error is returned
    expect(result.content[0].text).toContain(
      'One or more commands in the sequence are not allowed'
    );
    // Verify the logger was called with the correct arguments
    expect(logSpy).toHaveBeenCalledWith(
      command,
      'One or more commands in the sequence are not allowed'
    );
  });

  it('should include custom error message for blacklisted commands and log them', async () => {
    // Use a test directory path that will be allowed by our mock
    const testDir = '/test-dir';
    // Custom deny command with message
    const customDenyCommand = { command: 'rm', message: 'rm is dangerous, use trash-cli instead' };
    // Mock validateMultipleCommands to return a blacklisted command
    vi.spyOn(commandValidator, 'validateMultipleCommands').mockReturnValue({
      isValid: false,
      message: customDenyCommand.message,
      baseCommand: 'rm',
      command: 'rm -rf /',
    });
    // Spy on the logBlockedCommand function
    const logSpy = vi.spyOn(logger, 'logBlockedCommand');

    const command = 'rm -rf /';
    const result = await handleShellCommand(command, testDir);

    // Verify custom error message is used
    expect(result.content[0].text).toContain('rm is dangerous, use trash-cli instead');
    // Verify command is included in error
    expect(result.content[0].text).toContain('Command: rm -rf /');
    // Verify the logger was called with the correct arguments
    expect(logSpy).toHaveBeenCalledWith(command, customDenyCommand.message);
  });
});
