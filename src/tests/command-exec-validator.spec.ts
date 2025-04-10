import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  extractCommandFromXargs,
  validateCommandExecCommand,
  COMMANDS_THAT_EXECUTE_OTHER_COMMANDS,
} from '../command-exec-validator.js';
import { extractCommandFromFindExec } from '../find-exec-validator.js';
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
      {
        command: 'git',
        subCommands: ['status', 'log'],
      },
      {
        command: 'npm',
        denySubCommands: ['install', 'uninstall', 'update', 'audit'],
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

describe('COMMANDS_THAT_EXECUTE_OTHER_COMMANDS', () => {
  it('should include xargs and find', () => {
    expect(COMMANDS_THAT_EXECUTE_OTHER_COMMANDS).toContain('xargs');
    expect(COMMANDS_THAT_EXECUTE_OTHER_COMMANDS).toContain('find');
  });
});

describe('extractCommandFromXargs', () => {
  it('should extract command name from xargs command string', () => {
    expect(extractCommandFromXargs('xargs ls')).toBe('ls');
    expect(extractCommandFromXargs('xargs cat')).toBe('cat');
    expect(extractCommandFromXargs('xargs echo')).toBe('echo');
    expect(extractCommandFromXargs('find . -name "*.txt" | xargs grep pattern')).toBe('grep');
  });

  it('should return empty string if no command is found after xargs', () => {
    expect(extractCommandFromXargs('xargs')).toBe('');
    expect(extractCommandFromXargs('command xargs')).toBe('');
  });

  it('should handle whitespace properly', () => {
    expect(extractCommandFromXargs('xargs     ls')).toBe('ls');
    expect(extractCommandFromXargs('  xargs  cat  ')).toBe('cat');
  });
});

describe('extractCommandFromFindExec', () => {
  it('should extract command name from find -exec option', () => {
    expect(extractCommandFromFindExec('find . -exec ls {} ;')).toBe('ls');
    expect(extractCommandFromFindExec('find . -name "*.txt" -exec cat {} ;')).toBe('cat');
    expect(extractCommandFromFindExec('find . -type f -exec chmod 644 {} ;')).toBe('chmod');
  });

  it('should extract command name from find -execdir option', () => {
    expect(extractCommandFromFindExec('find . -execdir ls {} ;')).toBe('ls');
    expect(extractCommandFromFindExec('find . -name "*.txt" -execdir cat {} ;')).toBe('cat');
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

describe('validateCommandExecCommand', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null for valid exec commands', () => {
    const config = configLoader.getConfig();
    const baseResult: ValidationResult = {
      isValid: false,
      command: 'xargs ls',
      baseCommand: 'xargs',
      message: '',
      allowedCommands: config.allowCommands,
    };

    const result = validateCommandExecCommand('xargs', 'xargs ls', config, baseResult);
    expect(result).toBeNull();
  });

  it('should detect blacklisted commands in exec', () => {
    const config = configLoader.getConfig();
    const baseResult: ValidationResult = {
      isValid: false,
      command: 'xargs rm',
      baseCommand: 'xargs',
      message: '',
      allowedCommands: config.allowCommands,
    };

    const result = validateCommandExecCommand('xargs', 'xargs rm', config, baseResult);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('rm is dangerous');
      expect(result.blockReason?.location).toBe('validateCommandWithArgs:blacklistedCommandInExec');
    }
  });

  it('should detect commands not in allowlist in exec', () => {
    const mockConfig = {
      allowedDirectories: ['/', '/tmp'],
      allowCommands: ['ls', 'cat', 'echo', 'xargs', 'find'],
      denyCommands: [{ command: 'rm', message: 'rm is dangerous' }],
      defaultErrorMessage: 'Command not allowed',
    };
    vi.spyOn(configLoader, 'getConfig').mockReturnValue(mockConfig);

    const baseResult: ValidationResult = {
      isValid: false,
      command: 'xargs grep',
      baseCommand: 'xargs',
      message: '',
      allowedCommands: mockConfig.allowCommands,
    };

    const result = validateCommandExecCommand('xargs', 'xargs grep', mockConfig, baseResult);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Command not allowed: grep (in xargs)');
      expect(result.blockReason?.location).toBe(
        'validateCommandWithArgs:commandInExecNotInAllowlist'
      );
    }
  });

  it('should handle find -exec commands correctly', () => {
    const config = configLoader.getConfig();
    const baseResult: ValidationResult = {
      isValid: false,
      command: 'find . -exec ls {} \\;',
      baseCommand: 'find',
      message: '',
      allowedCommands: config.allowCommands,
    };

    const result = validateCommandExecCommand('find', 'find . -exec ls {} \\;', config, baseResult);
    expect(result).toBeNull();

    // With blacklisted command
    const resultWithBlacklisted = validateCommandExecCommand(
      'find',
      'find . -exec rm {} \\;',
      config,
      baseResult
    );
    expect(resultWithBlacklisted).not.toBeNull();
    if (resultWithBlacklisted) {
      expect(resultWithBlacklisted.isValid).toBe(false);
      expect(resultWithBlacklisted.message).toBe('rm is dangerous');
    }
  });

  it('should return null if no exec command found', () => {
    const config = configLoader.getConfig();
    const baseResult: ValidationResult = {
      isValid: false,
      command: 'find . -name "*.txt"',
      baseCommand: 'find',
      message: '',
      allowedCommands: config.allowCommands,
    };

    const result = validateCommandExecCommand('find', 'find . -name "*.txt"', config, baseResult);
    expect(result).toBeNull();
  });
});
