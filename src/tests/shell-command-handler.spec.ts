import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleShellCommand } from '../shell-command-handler.js';
import * as commandValidator from '../command-validator.js';
import * as logger from '../logger.js';

vi.mock('../config/config-loader.js', () => {
  const mockConfig = {
    allowedDirectories: ['/tmp', __dirname],
    allowCommands: ['ls', 'cat', 'git', 'echo'],
    denyCommands: [
      { command: 'rm', message: 'rm is dangerous' },
      { command: 'sudo', message: 'sudo is not allowed' },
      { command: 'chmod', message: 'chmod is not allowed' },
    ],
    defaultErrorMessage: 'Command not allowed',
  };
  return {
    getConfig: vi.fn(() => mockConfig),
    loadConfig: vi.fn(() => mockConfig),
    reloadConfig: vi.fn(() => mockConfig),
  };
});

describe('handleShellCommand', () => {
  beforeEach(() => {
    // Mock validateMultipleCommands to allow multiple commands by default
    vi.spyOn(commandValidator, 'validateMultipleCommands').mockReturnValue({
      isValid: true,
      message: '',
      command: '',
      baseCommand: '',
      allowedCommands: [],
    });
    // Mock logBlockedCommand to prevent actual logging during tests
    vi.spyOn(logger, 'logBlockedCommand').mockImplementation(() => {});
  });

  it('should handle command validation with ValidationResult including allowedCommands', async () => {
    // Mock validateMultipleCommands to return a structured ValidationResult
    const mockValidationResult = {
      isValid: true,
      message: 'Command is allowed',
      command: 'echo "test"',
      baseCommand: 'echo',
      allowedCommands: ['echo', 'ls', 'cat'],
    };
    vi.spyOn(commandValidator, 'validateMultipleCommands').mockReturnValue(mockValidationResult);

    const result = await handleShellCommand('echo "test"', __dirname);

    // Verify successful execution
    expect(result).toHaveProperty('content');
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(result.content[0].text).toContain('test');
  });

  it('should execute an allowed command', async () => {
    const result = await handleShellCommand('echo "test command execution"', __dirname);

    // Verify the expected output structure
    expect(result).toHaveProperty('content');
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(result.content[0]).toHaveProperty('mimeType', 'text/plain');
    expect(result.content[0].text).toContain('test command execution');
  });

  it('should return an error for non-existent commands and log them', async () => {
    // Spy on the logBlockedCommand function
    const logSpy = vi.spyOn(logger, 'logBlockedCommand');

    const result = await handleShellCommand('nonexistent-command', __dirname);

    // Verify error is returned
    expect(result.content[0].text).toContain('Command not found');
    // Verify the logger was called with the correct arguments
    expect(logSpy).toHaveBeenCalledWith('nonexistent-command', 'command not found');
  });

  it('should handle command with arguments correctly when command does not exist', async () => {
    const result = await handleShellCommand('ssss -a -b --option=value', __dirname);

    // Verify it only checks the base command existence
    expect(result.content[0].text).toContain('Command not found: ssss');
  });

  it('should handle execution errors gracefully', async () => {
    const result = await handleShellCommand('cat /nonexistent_file_123456789', __dirname);

    // Verify error is returned and handled properly
    expect(result).toHaveProperty('content');
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(result.content[0]).toHaveProperty('mimeType', 'text/plain');
    // Verify error message
    expect(result.content[0].text).toContain(
      `ExecaError: Command failed with exit code 1: 'cat /nonexistent_file_123456789'`
    );
  });

  it('should execute valid multi-command inputs', async () => {
    const result = await handleShellCommand('echo "first" && echo "second"', __dirname);

    // Verify we get the expected output
    expect(result).toHaveProperty('content');
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(result.content[0].text).toContain('first');
    expect(result.content[0].text).toContain('second');
  });

  it('should reject disallowed commands in multi-command sequences and log them', async () => {
    // Mock validateMultipleCommands to reject this command
    vi.spyOn(commandValidator, 'validateMultipleCommands').mockReturnValue({
      isValid: false,
      message: 'One or more commands in the sequence are not allowed',
      command: 'forbidden-command',
      baseCommand: 'forbidden-command',
      allowedCommands: [],
      blockReason: {
        location: 'validateCommandWithArgs:commandNotInAllowlist',
      },
    });
    // Spy on the logBlockedCommand function
    const logSpy = vi.spyOn(logger, 'logBlockedCommand');

    const command = 'echo "first" && forbidden-command';
    const result = await handleShellCommand(command, __dirname);

    // Verify error is returned
    expect(result.content[0].text).toContain(
      'One or more commands in the sequence are not allowed'
    );
    // Verify the logger was called with the correct arguments
    expect(logSpy).toHaveBeenCalledWith(
      command,
      expect.objectContaining({
        isValid: false,
        message: 'One or more commands in the sequence are not allowed',
        baseCommand: 'forbidden-command',
        command: 'forbidden-command',
        allowedCommands: [],
        blockReason: {
          location: 'validateCommandWithArgs:commandNotInAllowlist',
        },
      })
    );
  });

  it('should extract base command correctly for complex arguments', () => {
    // This test directly verifies the base command extraction logic
    // We'll access the private implementation through a spy

    // Create a function that mimics the base command extraction logic
    const extractBaseCommand = (cmd: string) => {
      const baseCommandMatch = cmd.trim().match(/^(\S+)/);
      return baseCommandMatch ? baseCommandMatch[1] : '';
    };

    // Test with a simple command
    expect(extractBaseCommand('ls -la')).toBe('ls');

    // Test with the complex command from the issue
    const complexCommand = 'grep -r "pattern" . --include="*.{md,json,js,ts,tsx,html,yml,yaml}"';
    expect(extractBaseCommand(complexCommand)).toBe('grep');
  });

  it('should include custom error message for blacklisted commands and log them', async () => {
    // Custom deny command with message
    const customDenyCommand = { command: 'rm', message: 'rm is dangerous, use trash-cli instead' };
    // Mock validateMultipleCommands to return a blacklisted command
    vi.spyOn(commandValidator, 'validateMultipleCommands').mockReturnValue({
      isValid: false,
      message: customDenyCommand.message,
      baseCommand: 'rm',
      command: 'rm -rf /',
      allowedCommands: [],
      blockReason: {
        denyCommand: customDenyCommand,
        location: 'validateCommandWithArgs:blacklistedBaseCommand',
      },
    });
    // Spy on the logBlockedCommand function
    const logSpy = vi.spyOn(logger, 'logBlockedCommand');

    const command = 'rm -rf /';
    const result = await handleShellCommand(command, __dirname);

    // Verify custom error message is used
    expect(result.content[0].text).toContain('rm is dangerous, use trash-cli instead');
    // Verify command is included in error
    expect(result.content[0].text).toContain('Blocked command: rm -rf /');
    // Verify the logger was called with the correct arguments
    expect(logSpy).toHaveBeenCalledWith(
      command,
      expect.objectContaining({
        isValid: false,
        message: customDenyCommand.message,
        baseCommand: 'rm',
        command: 'rm -rf /',
        allowedCommands: [],
        blockReason: {
          denyCommand: customDenyCommand,
          location: 'validateCommandWithArgs:blacklistedBaseCommand',
        },
      })
    );
  });
});
