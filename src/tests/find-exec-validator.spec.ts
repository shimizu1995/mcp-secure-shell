import { describe, it, expect, vi } from 'vitest';
import {
  extractCommandFromFindExec,
  processFindExecCommand,
  validateFindExecCommand,
  isFindExecCommand,
} from '../find-exec-validator.js';
import * as configLoader from '../config/config-loader.js';
import { ValidationResult } from '../command-validator.js';

vi.mock('../config/config-loader.js', () => {
  const mockConfig = {
    allowedDirectories: ['/tmp', __dirname],
    allowCommands: [
      'ls',
      'cat',
      'echo',
      'grep',
      'wc',
      'date',
      'xargs',
      'find',
      'node',
      {
        command: 'git',
        subCommands: ['status', 'log'],
      },
    ],
    denyCommands: [
      { command: 'rm', message: 'rm is dangerous' },
      { command: 'sudo', message: 'sudo is not allowed' },
      { command: 'chmod', message: 'chmod is not allowed' },
    ],
    defaultErrorMessage: 'Command not allowed',
  };
  return {
    getConfig: vi.fn(() => mockConfig),
    reloadConfig: vi.fn(() => mockConfig),
  };
});

describe('isFindExecCommand', () => {
  it('should return true for find -exec commands', () => {
    expect(isFindExecCommand('find . -exec ls {} \\;')).toBe(true);
    expect(isFindExecCommand('find . -name "*.txt" -exec grep pattern {} \\;')).toBe(true);
  });

  it('should return false for non-find-exec commands', () => {
    expect(isFindExecCommand('find . -name "*.txt"')).toBe(false);
    expect(isFindExecCommand('ls -la')).toBe(false);
    expect(isFindExecCommand('grep pattern file.txt')).toBe(false);
  });
});

describe('extractCommandFromFindExec', () => {
  it('should extract command name from find -exec option', () => {
    expect(extractCommandFromFindExec('find . -exec ls {} \\;')).toBe('ls');
    expect(extractCommandFromFindExec('find . -name "*.txt" -exec cat {} \\;')).toBe('cat');
  });

  it('should extract command name from find -execdir option', () => {
    expect(extractCommandFromFindExec('find . -execdir ls {} \\;')).toBe('ls');
    expect(extractCommandFromFindExec('find . -name "*.txt" -execdir cat {} \\;')).toBe('cat');
  });

  it('should return empty string if no -exec option is found', () => {
    expect(extractCommandFromFindExec('find . -name "*.txt"')).toBe('');
    expect(extractCommandFromFindExec('grep pattern file.txt')).toBe('');
  });

  it('should extract command name from find -exec with more complex commands', () => {
    expect(
      extractCommandFromFindExec(
        'find . -name "*.spec.ts" -exec grep -l "allowedDirectories" {} \\;'
      )
    ).toBe('grep');
    expect(extractCommandFromFindExec('find . -type f -name "*.js" -exec node {} \\;')).toBe(
      'node'
    );
  });
});

describe('processFindExecCommand', () => {
  it('should split commands with && operator', () => {
    const result = processFindExecCommand(
      'find . -name "*.txt" -exec grep pattern {} \\; && echo "Done"'
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('find . -name "*.txt" -exec grep pattern {} \\;');
    expect(result[1]).toBe('echo "Done"');
  });

  it('should split commands with ; operator but preserve escaped \\;', () => {
    const result = processFindExecCommand(
      'find . -name "*.txt" -exec grep pattern {} \\; ; echo "Done"'
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('find . -name "*.txt" -exec grep pattern {} \\;');
    expect(result[1]).toBe('echo "Done"');
  });

  it('should return the original command if no operators are found', () => {
    const command = 'find . -name "*.txt" -exec grep pattern {} \\;';
    const result = processFindExecCommand(command);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(command);
  });
});

describe('validateFindExecCommand', () => {
  it('should return null for valid find -exec commands', () => {
    const config = configLoader.getConfig();
    const baseResult: ValidationResult = {
      isValid: false,
      command: 'find . -exec grep pattern {} \\;',
      baseCommand: 'find',
      message: '',
      allowedCommands: config.allowCommands,
    };

    const result = validateFindExecCommand('find . -exec grep pattern {} \\;', config, baseResult);
    expect(result).toBeNull();
  });

  it('should detect blacklisted commands in find -exec', () => {
    const config = configLoader.getConfig();
    const baseResult: ValidationResult = {
      isValid: false,
      command: 'find . -exec rm {} \\;',
      baseCommand: 'find',
      message: '',
      allowedCommands: config.allowCommands,
    };

    const result = validateFindExecCommand('find . -exec rm {} \\;', config, baseResult);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('rm is dangerous');
      expect(result.blockReason?.location).toBe('validateFindExecCommand:blacklistedCommandInExec');
    }
  });

  it('should detect commands not in allowlist in find -exec', () => {
    const mockConfig = {
      allowedDirectories: ['/', '/tmp'],
      allowCommands: ['ls', 'cat', 'echo', 'find'],
      denyCommands: [{ command: 'rm', message: 'rm is dangerous' }],
      defaultErrorMessage: 'Command not allowed',
    };
    vi.spyOn(configLoader, 'getConfig').mockReturnValue(mockConfig);

    const baseResult: ValidationResult = {
      isValid: false,
      command: 'find . -exec grep pattern {} \\;',
      baseCommand: 'find',
      message: '',
      allowedCommands: mockConfig.allowCommands,
    };

    const result = validateFindExecCommand(
      'find . -exec grep pattern {} \\;',
      mockConfig,
      baseResult
    );
    expect(result).not.toBeNull();
    if (result) {
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Command not allowed: grep (in find -exec)');
      expect(result.blockReason?.location).toBe(
        'validateFindExecCommand:commandInExecNotInAllowlist'
      );
    }
  });

  it('should handle the complex case with find exec', () => {
    // Create a custom config with grep in the allowCommands for this test
    const customConfig = {
      allowedDirectories: ['/tmp', __dirname],
      allowCommands: ['ls', 'cat', 'echo', 'grep', 'wc', 'date', 'xargs', 'find', 'node'],
      denyCommands: [
        { command: 'rm', message: 'rm is dangerous' },
        { command: 'sudo', message: 'sudo is not allowed' },
        { command: 'chmod', message: 'chmod is not allowed' },
      ],
      defaultErrorMessage: 'Command not allowed',
    };

    const baseResult: ValidationResult = {
      isValid: false,
      command: 'find . -name "*.spec.ts" -exec grep -l "allowedDirectories" {} \\;',
      baseCommand: 'find',
      message: '',
      allowedCommands: customConfig.allowCommands,
    };

    const result = validateFindExecCommand(
      'find . -name "*.spec.ts" -exec grep -l "allowedDirectories" {} \\;',
      customConfig,
      baseResult
    );
    expect(result).toBeNull(); // Should pass validation as grep is in the allowlist
  });
});
