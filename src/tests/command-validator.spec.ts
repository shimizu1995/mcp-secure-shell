import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import { DenyCommand } from '../config/shell-command-config.js';
import {
  validateCommand,
  validateCommandWithArgs,
  findDenyCommandInBlacklist,
  getBlacklistErrorMessage,
} from '../command-validator.js';
import { getConfig, reloadConfig } from '../config/config-loader.js';

const CONFIG_FOR_TEST = path.join(__dirname, 'mcp-test-config.json');
process.env.MCP_CONFIG_PATH = CONFIG_FOR_TEST;

// コンフィグの初期化
describe('Config Initialization', () => {
  beforeEach(() => {
    // テスト前にコンフィグを再読み込み
    reloadConfig();
  });

  it('should load default config', () => {
    const config = getConfig();
    expect(config).toBeDefined();
    expect(config.allowCommands).toBeDefined();
    expect(config.denyCommands).toBeDefined();
    expect(config.defaultErrorMessage).toBeDefined();
  });
});

describe('validateCommand', () => {
  it('should return true for whitelisted commands', () => {
    expect(validateCommand('ls')).toBe(true);
    expect(validateCommand('cat')).toBe(true);
    expect(validateCommand('echo')).toBe(true);
  });

  it('should return false for non-whitelisted commands', () => {
    expect(validateCommand('nonexistent-command')).toBe(false);
    expect(validateCommand('sudo')).toBe(false);
    expect(validateCommand('malicious-command')).toBe(false);
  });
});

describe('validateCommandWithArgs', () => {
  it('should validate commands with arguments', () => {
    expect(validateCommandWithArgs('ls -la')).toBe(true);
    expect(validateCommandWithArgs('git status')).toBe(true);
  });

  it('should validate subcommands based on configuration', () => {
    expect(validateCommandWithArgs('git status')).toBe(true); // 許可されたサブコマンド
    expect(validateCommandWithArgs('npm run')).toBe(true); // 許可されたサブコマンド
  });

  it('should reject unauthorized subcommands', () => {
    expect(validateCommandWithArgs('git danger-command')).toBe(false); // 許可されていないサブコマンド
  });
});

describe('findDenyCommandInBlacklist', () => {
  it('should return DenyCommand for commands containing blacklisted terms', () => {
    expect(findDenyCommandInBlacklist('rm -rf /')).not.toBeNull();
    expect(findDenyCommandInBlacklist('echo hello | sudo bash')).not.toBeNull();
    expect(findDenyCommandInBlacklist('cat file | grep pattern | chmod')).not.toBeNull();
    expect(findDenyCommandInBlacklist('find . -exec chmod 777 {} ;')).not.toBeNull();
  });

  it('should return DenyCommand for xargs command with blacklisted argument', () => {
    const result = findDenyCommandInBlacklist('xargs rm');
    expect(result).not.toBeNull();
    expect(result && typeof result === 'object' ? result.command : result).toBe('rm');
  });

  it('should return DenyCommand for find command with blacklisted argument', () => {
    const result = findDenyCommandInBlacklist('find . -type f -exec chmod 644 {} ;');
    expect(result).not.toBeNull();
    // Since 'find' itself is blacklisted, it will return the 'find' DenyCommand first
    // before checking the arguments
    expect(result && typeof result === 'object' ? result.command : result).toBe('find');
  });

  it('should return DenyCommand even if blacklisted command is not the base command', () => {
    expect(findDenyCommandInBlacklist('echo Let me explain how sudo works')).not.toBeNull();
    expect(findDenyCommandInBlacklist('ls | xargs rm')).not.toBeNull();
    expect(findDenyCommandInBlacklist('ls ; rm')).not.toBeNull();
  });

  it('should return null for safe commands with no blacklisted terms', () => {
    expect(findDenyCommandInBlacklist('ls -la')).toBeNull();
    expect(findDenyCommandInBlacklist('echo Hello World')).toBeNull();
    expect(findDenyCommandInBlacklist('git status')).toBeNull();
    expect(findDenyCommandInBlacklist('cat /etc/passwd')).toBeNull();
  });

  it('should allow ls with find filename as argument', () => {
    // 'ls find' should be allowed since 'find' is just an argument to 'ls', not a command being executed
    expect(findDenyCommandInBlacklist('ls find')).toBeNull();
  });

  it('should show proper behavior for file names containing blacklisted terms', () => {
    const rmResult = findDenyCommandInBlacklist('cat rm-instructions.txt');
    expect(rmResult).toBeNull();

    const echoResult = findDenyCommandInBlacklist('echo "Do not use rm"');
    expect(echoResult).toBeNull();
  });

  it('should handle commands with arguments and pipes correctly', () => {
    expect(findDenyCommandInBlacklist('ls -la | grep file | wc -l')).toBeNull();
    expect(findDenyCommandInBlacklist('git grep "pattern" -- "*.js"')).toBeNull();
    expect(findDenyCommandInBlacklist('find . -name *.js | xargs rm')).not.toBeNull();
  });

  it('should handle empty or whitespace-only commands', () => {
    expect(findDenyCommandInBlacklist('')).toBeNull();
    expect(findDenyCommandInBlacklist('   ')).toBeNull();
  });

  it('should detect regex pattern blacklisted commands', () => {
    expect(findDenyCommandInBlacklist('anything with sudo in it')).not.toBeNull();
    expect(findDenyCommandInBlacklist('run sudo command')).not.toBeNull();
    expect(findDenyCommandInBlacklist('try to use sudoers')).not.toBeNull();
  });

  it('should extract the correct base command from a regex pattern', () => {
    const sudoCommand = findDenyCommandInBlacklist('anything with sudo in it');
    expect(sudoCommand).not.toBeNull();
    if (sudoCommand && typeof sudoCommand === 'object') {
      expect(sudoCommand.command).toBe('regex:.*sudo.*');
      expect(sudoCommand.message).toBe('sudo コマンドは権限昇格のため使用できません。');
    }

    const command = findDenyCommandInBlacklist('trying to use sudoers');
    expect(command).not.toBeNull();
    if (command && typeof command === 'object') {
      expect(command.command).toBe('regex:.*sudo.*');
    }
  });

  it('should return the correct DenyCommand object for specific commands', () => {
    const rmCommand = findDenyCommandInBlacklist('rm -rf /');
    expect(rmCommand).not.toBeNull();
    expect(typeof rmCommand).toBe('object');
    if (rmCommand && typeof rmCommand === 'object') {
      expect(rmCommand.command).toBe('rm');
      expect(rmCommand.message).toBeDefined();
    }

    const sudoCommand = findDenyCommandInBlacklist('sudo ls');
    expect(sudoCommand).not.toBeNull();
    if (sudoCommand && typeof sudoCommand === 'object') {
      expect(sudoCommand.command).toBe('regex:.*sudo.*');
    }
  });
});

describe('getBlacklistErrorMessage', () => {
  it('should return custom error message for blacklisted commands with message', () => {
    // rmコマンドは message プロパティを持っているはず
    const rmCommand = {
      command: 'rm',
      message:
        'rm コマンドは危険なため使用できません。代わりにゴミ箱に移動するコマンドを使用してください',
    };
    const rmError = getBlacklistErrorMessage(rmCommand);
    expect(rmError).toContain('代わりにゴミ箱に移動する');

    // sudoコマンドも message プロパティを持っているはず
    const sudoCommand = {
      command: 'sudo',
      message: 'sudo コマンドは権限昇格のため使用できません。',
    };
    const sudoError = getBlacklistErrorMessage(sudoCommand);
    expect(sudoError).toContain('権限昇格');
  });

  it('should return default error message for commands without message', () => {
    // messageプロパティがないDenyCommandを作成
    const denyCommandWithoutMessage: DenyCommand = 'test-command';
    const defaultError = getBlacklistErrorMessage(denyCommandWithoutMessage);
    expect(defaultError).toBe(getConfig().defaultErrorMessage);
  });

  it('should return default error message for commands with undefined message', () => {
    // messageプロパティが undefined の DenyCommand を作成
    const denyCommandWithUndefinedMessage: DenyCommand = {
      command: 'test-command',
      message: undefined,
    };
    const defaultError = getBlacklistErrorMessage(denyCommandWithUndefinedMessage);
    expect(defaultError).toBe(getConfig().defaultErrorMessage);
  });
});
