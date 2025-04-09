import { describe, it, expect } from 'vitest';
import {
  getCommandName,
  findCommandInAllowlist,
  getDenyCommandName,
  getDenyCommandMessage,
} from '../../utils/command-utils.js';
import { ShellCommandConfig } from '../../config/shell-command-config.js';

describe('getCommandName', () => {
  it('should extract command name from string', () => {
    expect(getCommandName('ls')).toBe('ls');
    expect(getCommandName('git')).toBe('git');
    expect(getCommandName('npm')).toBe('npm');
  });

  it('should extract command name from object with command property', () => {
    expect(getCommandName({ command: 'git' })).toBe('git');
    expect(getCommandName({ command: 'npm' })).toBe('npm');
  });

  it('should extract command name from object with command and subCommands properties', () => {
    expect(getCommandName({ command: 'git', subCommands: ['status', 'log'] })).toBe('git');
    expect(getCommandName({ command: 'npm', subCommands: ['install', 'run'] })).toBe('npm');
  });
});

describe('findCommandInAllowlist', () => {
  it('should return the matching command from the allowlist', () => {
    const allowCommands = [
      'ls',
      'cat',
      'echo',
      { command: 'git', subCommands: ['status', 'log'] },
      { command: 'npm', denySubCommands: ['install', 'uninstall'] },
    ];

    expect(findCommandInAllowlist('ls', allowCommands)).toBe('ls');
    expect(findCommandInAllowlist('cat', allowCommands)).toBe('cat');
    expect(findCommandInAllowlist('echo', allowCommands)).toBe('echo');
    expect(findCommandInAllowlist('git', allowCommands)).toEqual({
      command: 'git',
      subCommands: ['status', 'log'],
    });
    expect(findCommandInAllowlist('npm', allowCommands)).toEqual({
      command: 'npm',
      denySubCommands: ['install', 'uninstall'],
    });

    expect(findCommandInAllowlist('rm', allowCommands)).toBeNull();
    expect(findCommandInAllowlist('cp', allowCommands)).toBeNull();
    expect(findCommandInAllowlist('sudo', allowCommands)).toBeNull();
  });

  it('should return null for empty allowlist', () => {
    expect(findCommandInAllowlist('ls', [])).toBeNull();
  });
});

describe('getDenyCommandName', () => {
  it('should extract command name from string deny command', () => {
    expect(getDenyCommandName('rm')).toBe('rm');
    expect(getDenyCommandName('sudo')).toBe('sudo');
  });

  it('should extract command name from object deny command', () => {
    expect(getDenyCommandName({ command: 'rm', message: 'rm is dangerous' })).toBe('rm');
    expect(getDenyCommandName({ command: 'sudo', message: 'sudo is not allowed' })).toBe('sudo');
  });
});

describe('getDenyCommandMessage', () => {
  it('should return custom message from deny command object if available', () => {
    const config: ShellCommandConfig = {
      allowedDirectories: ['/tmp'],
      allowCommands: ['ls', 'cat'],
      denyCommands: [],
      defaultErrorMessage: 'Command not allowed',
    };

    const denyCmd = { command: 'rm', message: 'rm is dangerous' };
    expect(getDenyCommandMessage(denyCmd, config)).toBe('rm is dangerous');
  });

  it('should return default error message if deny command is string', () => {
    const config: ShellCommandConfig = {
      allowedDirectories: ['/tmp'],
      allowCommands: ['ls', 'cat'],
      denyCommands: [],
      defaultErrorMessage: 'Command not allowed',
    };

    expect(getDenyCommandMessage('rm', config)).toBe('Command not allowed');
  });

  it('should return default error message if deny command object has no message', () => {
    const config: ShellCommandConfig = {
      allowedDirectories: ['/tmp'],
      allowCommands: ['ls', 'cat'],
      denyCommands: [],
      defaultErrorMessage: 'Command not allowed',
    };

    const denyCmd = { command: 'rm' };
    expect(getDenyCommandMessage(denyCmd, config)).toBe('Command not allowed');
  });
});
