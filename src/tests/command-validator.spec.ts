import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DenyCommand } from '../config/shell-command-config.js';
import {
  validateCommandWithArgs,
  findDenyCommandInBlacklist,
  getBlacklistErrorMessage,
  getCommandName,
  extractCommands,
  validateMultipleCommands,
} from '../command-validator.js';
import * as configLoader from '../config/config-loader.js';

// コンフィグの初期化
describe('Config Initialization', () => {
  beforeEach(() => {
    // テスト前にコンフィグを再読み込み
    configLoader.reloadConfig();
  });

  it('should load default config', () => {
    const config = configLoader.getConfig();
    expect(config).toBeDefined();
    expect(config.allowCommands).toBeDefined();
    expect(config.denyCommands).toBeDefined();
    expect(config.defaultErrorMessage).toBeDefined();
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

  it('should reject denied subcommands', () => {
    // NPMのInstallやUninstallなどは拒否リストに入っている
    expect(validateCommandWithArgs('npm install')).toBe(false);
    expect(validateCommandWithArgs('npm uninstall')).toBe(false);
    expect(validateCommandWithArgs('npm update')).toBe(false);
    expect(validateCommandWithArgs('npm audit')).toBe(false);

    // 拒否リストに入っていないサブコマンドは許可される
    expect(validateCommandWithArgs('npm run')).toBe(true);
    expect(validateCommandWithArgs('npm test')).toBe(true);
    expect(validateCommandWithArgs('npm ci')).toBe(true);
  });

  it('should handle whitespace in commands properly', () => {
    expect(validateCommandWithArgs('ls    -la')).toBe(true);
    expect(validateCommandWithArgs('  ls -la  ')).toBe(true);
    expect(validateCommandWithArgs('git    status')).toBe(true);
  });

  it('should allow all subcommands for string-only whitelist entries', () => {
    // ls is defined as a string in the test config, so all subcommands should be allowed
    expect(validateCommandWithArgs('ls -la')).toBe(true);
    expect(validateCommandWithArgs('ls -ltr')).toBe(true);
    expect(validateCommandWithArgs('ls --any-option')).toBe(true);
  });

  it('should handle complex command strings', () => {
    // Command with multiple arguments
    expect(validateCommandWithArgs('ls -la /tmp')).toBe(true);
    // Command with options and arguments
    expect(validateCommandWithArgs('git log --oneline -n 5')).toBe(true);
  });

  it('should handle empty or whitespace-only commands', () => {
    expect(validateCommandWithArgs('')).toBe(false);
    expect(validateCommandWithArgs('   ')).toBe(false);
  });
});

describe('findDenyCommandInBlacklist', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return DenyCommand for commands containing blacklisted terms', () => {
    // Specific command detection still works, but regex matching is disabled
    expect(findDenyCommandInBlacklist('rm -rf /')).not.toBeNull();
    // The following tests now return null since regex matching is disabled
    // and sudo is only checked as a specific command
    expect(findDenyCommandInBlacklist('echo hello | sudo bash')).toBeNull();
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
    expect(findDenyCommandInBlacklist('echo Let me explain how sudo works')).toBeNull(); // No regex matching
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

  it('should handle command parsing correctly', () => {
    // regexモード削除後の動作確認テスト
    // テスト用の設定を使用
    const mockConfig = {
      allowedDirectories: ['/', '/tmp'],
      allowCommands: ['ls', 'cat'],
      denyCommands: [
        { command: 'rm', message: 'rm is dangerous' },
        { command: 'sudo', message: 'sudo is not allowed' },
      ],
      defaultErrorMessage: 'Command not allowed',
    };
    vi.spyOn(configLoader, 'getConfig').mockReturnValue(mockConfig);

    // 直接のコマンドのチェック
    expect(findDenyCommandInBlacklist('sudo')).not.toBeNull();
    expect(findDenyCommandInBlacklist('rm')).not.toBeNull();

    // 混合コマンドチェック - sudoがベースコマンドなのでブロックされる
    const result = findDenyCommandInBlacklist('sudo ls');
    expect(result).not.toBeNull();
    if (result && typeof result === 'object') {
      expect(result.command).toBe('sudo');
    }

    // ベースコマンドがsudoでない場合は安全
    expect(findDenyCommandInBlacklist('echo sudo')).toBeNull();
    expect(findDenyCommandInBlacklist('something sudo')).toBeNull();
  });

  it('should return the correct DenyCommand object for specific commands', () => {
    // Mock config to ensure it includes sudo as a specific command
    const mockConfig = {
      allowedDirectories: ['/', '/tmp'],
      allowCommands: ['ls', 'cat'],
      denyCommands: [
        { command: 'rm', message: 'rm is dangerous' },
        { command: 'sudo', message: 'sudo is not allowed' },
      ],
      defaultErrorMessage: 'Command not allowed',
    };
    vi.spyOn(configLoader, 'getConfig').mockReturnValue(mockConfig);

    const rmCommand = findDenyCommandInBlacklist('rm -rf /');
    expect(rmCommand).not.toBeNull();
    expect(typeof rmCommand).toBe('object');
    if (rmCommand && typeof rmCommand === 'object') {
      expect(rmCommand.command).toBe('rm');
      expect(rmCommand.message).toBeDefined();
    }

    // Now sudo should be detected
    const sudoCommand = findDenyCommandInBlacklist('sudo');
    expect(sudoCommand).not.toBeNull();
    if (sudoCommand && typeof sudoCommand === 'object') {
      expect(sudoCommand.command).toBe('sudo');
    }
  });
});

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
    expect(defaultError).toBe(configLoader.getConfig().defaultErrorMessage);
  });

  it('should return default error message for commands with undefined message', () => {
    // messageプロパティが undefined の DenyCommand を作成
    const denyCommandWithUndefinedMessage: DenyCommand = {
      command: 'test-command',
      message: undefined,
    };
    const defaultError = getBlacklistErrorMessage(denyCommandWithUndefinedMessage);
    expect(defaultError).toBe(configLoader.getConfig().defaultErrorMessage);
  });
});

describe('extractCommands', () => {
  it('should extract commands separated by semicolons', () => {
    const input = 'ls -la; cat file.txt; echo test';
    const commands = extractCommands(input);
    expect(commands).toContain('ls -la');
    expect(commands).toContain('cat file.txt');
    expect(commands).toContain('echo test');
    // 個々のコマンドを3つ抽出
    expect(commands.length).toBe(3);
  });

  it('should extract commands separated by pipe', () => {
    const input = 'cat file.txt | grep pattern | wc -l';
    const commands = extractCommands(input);
    expect(commands).toContain('cat file.txt');
    expect(commands).toContain('grep pattern');
    expect(commands).toContain('wc -l');
    expect(commands.length).toBe(3); // 3つのコマンドを抽出
  });

  it('should extract commands separated by AND operator', () => {
    const input = 'mkdir test && cd test && touch file.txt';
    const commands = extractCommands(input);
    expect(commands).toContain('mkdir test');
    expect(commands).toContain('cd test');
    expect(commands).toContain('touch file.txt');
    expect(commands.length).toBe(3); // 3つのコマンドを抽出
  });

  it('should extract commands separated by OR operator', () => {
    const input = 'ls nonexistent || echo "Not found"';
    const commands = extractCommands(input);
    expect(commands).toContain('ls nonexistent');
    expect(commands).toContain('echo "Not found"');
    expect(commands.length).toBe(2); // 2つのコマンドを抽出
  });

  it('should extract commands from command substitution', () => {
    const input = 'echo $(date)';
    const commands = extractCommands(input);
    // コマンド置換は置換後の形式で返される
    expect(commands).toContain('echo __SUBST0__');
    expect(commands).toContain('date');
    expect(commands.length).toBe(2); // 2つのコマンドを抽出
  });

  it('should extract commands from complex combinations', () => {
    const input = 'ls -la | grep .js && echo $(date) || echo "failed"';
    const commands = extractCommands(input);
    expect(commands).toContain('ls -la');
    expect(commands).toContain('grep .js');
    // コマンド置換は置換後の形式で返される
    expect(commands).toContain('echo __SUBST0__');
    expect(commands).toContain('date');
    expect(commands).toContain('echo "failed"');
    expect(commands.length).toBe(5); // 5つのコマンドを抽出
  });

  it('should handle brace groups', () => {
    const input = '{ ls -la; echo test; }';
    const commands = extractCommands(input);
    expect(commands).toContain('ls -la');
    expect(commands).toContain('echo test');
    expect(commands.length).toBe(2); // 2つのコマンドを抽出
  });

  it('should handle parenthesis groups', () => {
    const input = '(ls -la; echo test)';
    const commands = extractCommands(input);
    expect(commands).toContain('ls -la');
    expect(commands).toContain('echo test');
    expect(commands.length).toBe(2); // 2つのコマンドを抽出
  });
});

describe('validateMultipleCommands', () => {
  it('should return true when all commands in a sequence are allowed', () => {
    // Assuming ls, cat, and echo are in the allowlist
    expect(validateMultipleCommands('ls -la; cat file.txt; echo test')).toBe(true);
  });

  it('should return false when any command in a sequence is not allowed', () => {
    // Assuming rm is blacklisted
    expect(validateMultipleCommands('ls -la; rm -rf /; echo test')).toBe(false);
  });

  it('should return true for simple allowed commands', () => {
    expect(validateMultipleCommands('ls -la')).toBe(true);
  });

  it('should validate commands with pipes', () => {
    expect(validateMultipleCommands('cat file.txt | grep pattern')).toBe(true);
  });

  it('should validate commands with command substitution', () => {
    expect(validateMultipleCommands('echo $(date)')).toBe(true);
  });

  it('should validate complex command combinations', () => {
    expect(validateMultipleCommands('ls -la | grep .js && echo $(date) || echo "failed"')).toBe(
      true
    );
  });

  it('should reject if command substitution contains disallowed commands', () => {
    // Assuming rm is blacklisted
    expect(validateMultipleCommands('echo $(rm -rf /)')).toBe(false);
  });

  it('should handle brace and parenthesis groups', () => {
    expect(validateMultipleCommands('{ ls -la; echo test; }')).toBe(true);
    expect(validateMultipleCommands('(ls -la; echo test)')).toBe(true);
  });
});
