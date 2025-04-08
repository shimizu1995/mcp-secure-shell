import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  validateCommandWithArgs,
  getCommandName,
  extractCommands,
  validateMultipleCommands,
  checkForOutputRedirection,
} from '../command-validator.js';
import * as configLoader from '../config/config-loader.js';
import { AllowCommand } from '../config/shell-command-config.js';

// Internal helper functions for tests
function extractCommandFromXargs(command: string): string {
  const parts = command.trim().split(/\s+/);
  const xargsIndex = parts.findIndex((part) => part === 'xargs');

  if (xargsIndex >= 0 && xargsIndex + 1 < parts.length) {
    return parts[xargsIndex + 1];
  }

  return '';
}

function extractCommandFromFindExec(command: string): string {
  const execPattern = /\s+-exec(?:dir)?\s+(\S+)/;
  const match = command.match(execPattern);

  if (match && match[1]) {
    return match[1];
  }

  return '';
}

function isCommandInAllowlist(commandName: string, allowCommands: AllowCommand[]): boolean {
  return allowCommands.some((cmd) => {
    const cmdName = getCommandName(cmd);
    return cmdName === commandName;
  });
}

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should validate commands with arguments', () => {
    const result = validateCommandWithArgs('ls -la');
    expect(result.isValid).toBe(true);
    const resultGit = validateCommandWithArgs('git status');
    expect(resultGit.isValid).toBe(true);
  });

  it('should validate subcommands based on configuration', () => {
    expect(validateCommandWithArgs('git status').isValid).toBe(true); // 許可されたサブコマンド
    expect(validateCommandWithArgs('npm run').isValid).toBe(true); // 許可されたサブコマンド
  });

  it('should reject unauthorized subcommands', () => {
    const resultDanger = validateCommandWithArgs('git danger-command');
    expect(resultDanger.isValid).toBe(false); // 許可されていないサブコマンド
  });

  it('should reject denied subcommands', () => {
    // NPMのInstallやUninstallなどは拒否リストに入っている
    expect(validateCommandWithArgs('npm install').isValid).toBe(false);
    expect(validateCommandWithArgs('npm uninstall').isValid).toBe(false);
    expect(validateCommandWithArgs('npm update').isValid).toBe(false);
    expect(validateCommandWithArgs('npm audit').isValid).toBe(false);

    // 拒否リストに入っていないサブコマンドは許可される
    expect(validateCommandWithArgs('npm run').isValid).toBe(true);
    expect(validateCommandWithArgs('npm test').isValid).toBe(true);
    expect(validateCommandWithArgs('npm ci').isValid).toBe(true);
  });

  it('should handle whitespace in commands properly', () => {
    expect(validateCommandWithArgs('ls    -la').isValid).toBe(true);
    expect(validateCommandWithArgs('  ls -la  ').isValid).toBe(true);
    expect(validateCommandWithArgs('git    status').isValid).toBe(true);
  });

  it('should allow all subcommands for string-only allowlist entries', () => {
    // ls is defined as a string in the test config, so all subcommands should be allowed
    expect(validateCommandWithArgs('ls -la').isValid).toBe(true);
    expect(validateCommandWithArgs('ls -ltr').isValid).toBe(true);
    expect(validateCommandWithArgs('ls --any-option').isValid).toBe(true);
  });

  it('should handle complex command strings', () => {
    // Command with multiple arguments
    expect(validateCommandWithArgs('ls -la /tmp').isValid).toBe(true);
    // Command with options and arguments
    expect(validateCommandWithArgs('git log --oneline -n 5').isValid).toBe(true);
  });

  // 追加テスト：ブラックリストの正確な処理
  it('should handle special patterns for blacklisted commands', () => {
    // テスト用設定でrm、sudo、chmod、findがブラックリストに含まれていることを想定
    const mockConfig = {
      allowedDirectories: ['/', '/tmp'],
      allowCommands: [
        'ls',
        'cat',
        'git',
        'echo',
        'grep',
        'wc',
        {
          command: 'npm',
          subCommands: ['run'],
        },
      ],
      denyCommands: [
        { command: 'rm', message: 'rm is dangerous' },
        { command: 'sudo', message: 'sudo is not allowed' },
        { command: 'chmod', message: 'chmod is not allowed' },
        { command: 'find', message: 'find with exec is not allowed' },
      ],
      defaultErrorMessage: 'Command not allowed',
    };
    vi.spyOn(configLoader, 'getConfig').mockReturnValue(mockConfig);

    // 許可されたコマンドはtrue
    expect(validateCommandWithArgs('ls -la').isValid).toBe(true);
    expect(validateCommandWithArgs('cat file.txt').isValid).toBe(true);
    expect(validateCommandWithArgs('git status').isValid).toBe(true);
    expect(validateCommandWithArgs('echo "Hello World"').isValid).toBe(true);
    expect(validateCommandWithArgs('npm run test').isValid).toBe(true);
    expect(validateCommandWithArgs('npm install').isValid).toBe(false); // npm installは拒否

    // ブラックリストコマンドは拒否
    expect(validateCommandWithArgs('rm -rf /').isValid).toBe(false);
    expect(validateCommandWithArgs('chmod 777 file').isValid).toBe(false);
    expect(validateCommandWithArgs('find . -type f').isValid).toBe(false);

    // echoはsudoを含むが実際のコマンドではないので許可
    expect(validateCommandWithArgs('echo "Let me explain how sudo works"').isValid).toBe(true);

    // ファイル名にブラックリストの単語を含むが実際のコマンドではない
    expect(validateCommandWithArgs('cat rm-instructions.txt').isValid).toBe(true);
    expect(validateCommandWithArgs('echo "Do not use rm"').isValid).toBe(true);

    // lsに引数としてfindを使用する場合はtrue
    expect(validateCommandWithArgs('ls find').isValid).toBe(true);
  });

  it('should handle empty or whitespace-only commands correctly', () => {
    expect(validateCommandWithArgs('').isValid).toBe(false);
    expect(validateCommandWithArgs('   ').isValid).toBe(false);
  });

  // ブラックリスト関連のテスト（以前はfindDenyCommandInBlacklistで検証していた）
  it('should reject blacklisted commands', () => {
    // テスト用設定でrmとsudoがブラックリストに含まれていることを想定
    const mockConfig = {
      allowedDirectories: ['/', '/tmp'],
      allowCommands: ['ls', 'cat', 'git', 'echo'],
      denyCommands: [
        { command: 'rm', message: 'rm is dangerous' },
        { command: 'sudo', message: 'sudo is not allowed' },
        { command: 'chmod', message: 'chmod is not allowed' },
      ],
      defaultErrorMessage: 'Command not allowed',
    };
    vi.spyOn(configLoader, 'getConfig').mockReturnValue(mockConfig);

    // 禁止コマンドのチェック
    expect(validateCommandWithArgs('rm -rf /').isValid).toBe(false);
    expect(validateCommandWithArgs('sudo ls').isValid).toBe(false);
    expect(validateCommandWithArgs('chmod 777 file').isValid).toBe(false);

    // 安全なコマンドは許可
    expect(validateCommandWithArgs('ls -la').isValid).toBe(true);
    expect(validateCommandWithArgs('echo "Hello World"').isValid).toBe(true);
    expect(validateCommandWithArgs('git status').isValid).toBe(true);
    expect(validateCommandWithArgs('cat /etc/passwd').isValid).toBe(true);
  });

  it('should detect blacklisted commands in command execution arguments', () => {
    const mockConfig = {
      allowedDirectories: ['/', '/tmp'],
      allowCommands: ['ls', 'cat', 'xargs', 'find', 'echo'],
      denyCommands: [{ command: 'rm', message: 'rm is dangerous' }],
      defaultErrorMessage: 'Command not allowed',
    };
    vi.spyOn(configLoader, 'getConfig').mockReturnValue(mockConfig);

    // xargsの引数に禁止コマンドを含む場合はfalseを返す
    expect(validateCommandWithArgs('xargs rm').isValid).toBe(false);

    // 安全な引数の場合はtrueを返す
    expect(validateCommandWithArgs('xargs echo').isValid).toBe(true);

    // 普通の引数は問題なし
    expect(validateCommandWithArgs('ls find').isValid).toBe(true);
    expect(validateCommandWithArgs('echo "Do not use rm"').isValid).toBe(true);
  });

  it('should validate xargs commands are in the allowlist', () => {
    const mockConfig = {
      allowedDirectories: ['/', '/tmp'],
      allowCommands: ['ls', 'cat', 'echo', 'xargs'],
      denyCommands: [{ command: 'rm', message: 'rm is dangerous' }],
      defaultErrorMessage: 'Command not allowed',
    };
    vi.spyOn(configLoader, 'getConfig').mockReturnValue(mockConfig);

    // 許可リストにあるコマンドはxargsで使用可能
    expect(validateCommandWithArgs('xargs ls').isValid).toBe(true);
    expect(validateCommandWithArgs('xargs cat').isValid).toBe(true);
    expect(validateCommandWithArgs('xargs echo').isValid).toBe(true);

    // 許可リストにないコマンドはxargsで使用不可
    expect(validateCommandWithArgs('xargs cp').isValid).toBe(false);
    expect(validateCommandWithArgs('xargs grep').isValid).toBe(false);
    expect(validateCommandWithArgs('xargs mv').isValid).toBe(false);
  });
});

// テストケースをvalidateCommandWithArgsとvalidateMultipleCommandsに統合

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
});

describe('isCommandInAllowlist', () => {
  it('should check if a command is in the allowlist', () => {
    const allowCommands = [
      'ls',
      'cat',
      'echo',
      { command: 'git', subCommands: ['status', 'log'] },
      { command: 'npm', denySubCommands: ['install', 'uninstall'] },
    ];

    expect(isCommandInAllowlist('ls', allowCommands)).toBe(true);
    expect(isCommandInAllowlist('cat', allowCommands)).toBe(true);
    expect(isCommandInAllowlist('echo', allowCommands)).toBe(true);
    expect(isCommandInAllowlist('git', allowCommands)).toBe(true);
    expect(isCommandInAllowlist('npm', allowCommands)).toBe(true);

    expect(isCommandInAllowlist('rm', allowCommands)).toBe(false);
    expect(isCommandInAllowlist('cp', allowCommands)).toBe(false);
    expect(isCommandInAllowlist('sudo', allowCommands)).toBe(false);
  });

  it('should return false for empty allowlist', () => {
    expect(isCommandInAllowlist('ls', [])).toBe(false);
  });
});

describe('Complex cases with find and xargs', () => {
  it('should handle complex commands with find -exec', () => {
    const mockConfig = {
      allowedDirectories: ['/', '/tmp'],
      allowCommands: ['find', 'ls', 'grep', 'cat', 'chmod', 'echo'],
      denyCommands: [{ command: 'rm', message: 'rm is dangerous' }],
      defaultErrorMessage: 'Command not allowed',
    };
    vi.spyOn(configLoader, 'getConfig').mockReturnValue(mockConfig);

    // 複雑なfind -execコマンド
    expect(
      validateCommandWithArgs('find . -type f -name "*.js" -exec grep "pattern" {} ;').isValid
    ).toBe(true);
    expect(
      validateCommandWithArgs(
        'find . -path "*/node_modules/*" -prune -o -name "*.ts" -exec cat {} ;'
      ).isValid
    ).toBe(true);

    // 禁止コマンドを実行する場合
    expect(validateCommandWithArgs('find . -type f -mtime +30 -exec rm {} ;').isValid).toBe(false);
  });

  it('should handle complex commands with xargs', () => {
    const mockConfig = {
      allowedDirectories: ['/', '/tmp'],
      allowCommands: ['find', 'ls', 'grep', 'cat', 'chmod', 'echo', 'xargs'],
      denyCommands: [{ command: 'rm', message: 'rm is dangerous' }],
      defaultErrorMessage: 'Command not allowed',
    };
    vi.spyOn(configLoader, 'getConfig').mockReturnValue(mockConfig);

    // 複雑なxargsコマンド
    expect(validateCommandWithArgs('find . -name "*.txt" | xargs cat').isValid).toBe(true);
    expect(validateCommandWithArgs('find . -name "*.log" | xargs grep "error"').isValid).toBe(true);

    // 禁止コマンドを実行する場合
    expect(validateMultipleCommands('find . -type f -mtime +30 | xargs rm').isValid).toBe(false);
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

  it('should handle complex arguments with quoted parameters and special characters', () => {
    // Issue #19の例から取ったコマンド
    const input = 'grep -r "mcp-whitelist-shell" . --include="*.{md,json,js,ts,tsx,html,yml,yaml}"';
    const commands = extractCommands(input);
    expect(commands.length).toBe(1); // 1つのコマンドのみ
    expect(commands[0]).toBe(
      'grep -r "mcp-whitelist-shell" . --include="*.{md,json,js,ts,tsx,html,yml,yaml}"'
    );

    // 別の複雑な例
    const input2 = 'find . -name "*.js" -o -name "*.ts" -not -path "*/node_modules/*"';
    const commands2 = extractCommands(input2);
    expect(commands2.length).toBe(1);
    expect(commands2[0]).toBe('find . -name "*.js" -o -name "*.ts" -not -path "*/node_modules/*"');
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

describe('OUTPUT_REDIRECTION_REGEX', () => {
  // We need to import/access the regex pattern directly from the module
  // Since it's a private constant, we'll test it via the checkForOutputRedirection function

  it('should match single > redirection operator', () => {
    expect(checkForOutputRedirection('ls > file.txt')).not.toBeNull();
    expect(checkForOutputRedirection('echo hello > output.txt')).not.toBeNull();
  });

  it('should match >> redirection operator', () => {
    expect(checkForOutputRedirection('ls >> file.txt')).not.toBeNull();
    expect(checkForOutputRedirection('echo hello >> output.txt')).not.toBeNull();
  });

  it('should not match redirection symbols inside quotes', () => {
    expect(checkForOutputRedirection('echo "This > is a test"')).toBeNull();
    expect(checkForOutputRedirection("echo 'Symbol >> in quotes'")).toBeNull();
  });

  it('should match multiple redirection operators in a command', () => {
    expect(checkForOutputRedirection('cat file.txt > out1.txt > out2.txt')).not.toBeNull();
  });

  it('should match redirection at the end of a command', () => {
    expect(checkForOutputRedirection('cat file.txt >')).not.toBeNull();
  });

  it('should match redirection when combined with other shell operators', () => {
    expect(checkForOutputRedirection('grep pattern file.txt | sort > output.txt')).not.toBeNull();
    expect(checkForOutputRedirection('cat file.txt && echo "done" > log.txt')).not.toBeNull();
  });

  it('should not match > character when used as part of an argument or option', () => {
    expect(checkForOutputRedirection('cat file.txt -name=file>1')).toBeNull();
    expect(checkForOutputRedirection('find . -name "test>file.txt"')).toBeNull();
  });
});

describe('checkForOutputRedirection', () => {
  it('should detect output redirection with > operator', () => {
    const result = checkForOutputRedirection('ls > file.txt');
    expect(result).not.toBeNull();
    expect(result).toContain('Output redirection is not allowed');
    expect(result).toContain('overwrite redirection');
  });

  it('should detect output redirection with >> operator', () => {
    const result = checkForOutputRedirection('echo "hello" >> file.txt');
    expect(result).not.toBeNull();
    expect(result).toContain('Output redirection is not allowed');
    expect(result).toContain('append redirection');
  });

  it('should not detect redirection symbols inside quotes', () => {
    const result = checkForOutputRedirection('echo "This is a > symbol"');
    expect(result).toBeNull();
  });

  it('should handle multiple redirection symbols in a command', () => {
    const result = checkForOutputRedirection('cat file.txt > output.txt > another.txt');
    expect(result).not.toBeNull();
    expect(result).toContain('Output redirection is not allowed');
  });

  it('should handle redirection combined with pipes', () => {
    const result = checkForOutputRedirection('cat file.txt | grep pattern > output.txt');
    expect(result).not.toBeNull();
    expect(result).toContain('Output redirection is not allowed');
  });
});

describe('validateMultipleCommands', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return true when all commands in a sequence are allowed', () => {
    // Assuming ls, cat, and echo are in the allowlist
    const result = validateMultipleCommands('ls -la; cat file.txt; echo test');
    expect(result.isValid).toBe(true);
    expect(result.message).toBe('all commands are allowed');
  });

  it('should return deny command info when blacklisted command is found', () => {
    // テスト用設定
    const mockConfig = {
      allowedDirectories: ['/', '/tmp'],
      allowCommands: ['ls', 'cat', 'echo', 'grep', 'date'],
      denyCommands: [{ command: 'rm', message: 'rm is dangerous' }],
      defaultErrorMessage: 'Command not allowed',
    };
    vi.spyOn(configLoader, 'getConfig').mockReturnValue(mockConfig);

    // ブラックリストのコマンドを含む複合コマンド
    const result1 = validateMultipleCommands('ls -la; rm -rf /; echo test');
    expect(result1.isValid).toBe(false);
    expect(result1.message).toBe('rm is dangerous');
    expect(result1.command).toBe('rm -rf /');

    const result2 = validateMultipleCommands('ls -la | xargs rm');
    expect(result2.isValid).toBe(false);
    expect(result2.message).toBe('rm is dangerous');
    expect(result2.command).toBe('xargs rm');

    const result3 = validateMultipleCommands('ls ; rm');
    expect(result3.isValid).toBe(false);
    expect(result3.message).toBe('rm is dangerous');
    expect(result3.command).toBe('rm');
  });

  it('should return true for simple allowed commands', () => {
    const result = validateMultipleCommands('ls -la');
    expect(result.isValid).toBe(true);
    expect(result.message).toBe('all commands are allowed');
  });

  it('should validate commands with pipes', () => {
    const result1 = validateMultipleCommands('cat file.txt | grep pattern');
    expect(result1.isValid).toBe(true);
    expect(result1.message).toBe('all commands are allowed');

    const result2 = validateMultipleCommands('ls -la | grep file | wc -l');
    expect(result2.isValid).toBe(true);
    expect(result2.message).toBe('all commands are allowed');
  });

  it('should validate commands with command substitution', () => {
    const result = validateMultipleCommands('echo $(date)');
    expect(result.isValid).toBe(true);
    expect(result.message).toBe('all commands are allowed');
  });

  it('should handle more complex pipe and combination cases', () => {
    // テスト用設定
    const mockConfig = {
      allowedDirectories: ['/', '/tmp'],
      allowCommands: ['ls', 'cat', 'git', 'echo', 'grep', 'wc', 'xargs', 'date'],
      denyCommands: [
        { command: 'rm', message: 'rm is dangerous' },
        { command: 'find', message: 'find with exec is not allowed' },
      ],
      defaultErrorMessage: 'Command not allowed',
    };
    vi.spyOn(configLoader, 'getConfig').mockReturnValue(mockConfig);

    // 複合の安全なコマンド
    const result = validateMultipleCommands('ls -la | grep file | wc -l');
    expect(result.isValid).toBe(true);
    expect(validateMultipleCommands('git grep "pattern" -- "*.js"').isValid).toBe(true);

    // 複合の危険なコマンド
    const result1Complex = validateMultipleCommands('find . -name *.js | xargs rm');
    expect(result1Complex.isValid).toBe(false);

    const result2Complex = validateMultipleCommands('ls | xargs rm');
    expect(result2Complex.isValid).toBe(false);

    const result3Complex = validateMultipleCommands('ls ; rm');
    expect(result3Complex.isValid).toBe(false);

    // コマンド置換とパイプの組み合わせ
    const result1 = validateMultipleCommands('echo "Today is $(date)"');
    expect(result1.isValid).toBe(true);
    expect(result1.message).toBe('all commands are allowed');

    const resultRm = validateMultipleCommands('echo $(rm -rf /)');
    expect(resultRm.isValid).toBe(false);
    expect(resultRm.message).toBe('rm is dangerous');
  });

  it('should reject if command substitution contains disallowed commands', () => {
    // テスト用設定
    const mockConfig = {
      allowedDirectories: ['/', '/tmp'],
      allowCommands: ['ls', 'cat', 'echo', 'grep', 'date', 'find', 'xargs'],
      denyCommands: [{ command: 'rm', message: 'rm is dangerous' }],
      defaultErrorMessage: 'Command not allowed',
    };
    vi.spyOn(configLoader, 'getConfig').mockReturnValue(mockConfig);

    // コマンド置換内に禁止コマンドを含む
    const result1 = validateMultipleCommands('echo $(rm -rf /)');
    expect(result1.isValid).toBe(false);
    expect(result1.message).toBe('rm is dangerous');

    const result2 = validateMultipleCommands('find . -name *.js | xargs rm');
    expect(result2.isValid).toBe(false);
    expect(result2.message).toBe('rm is dangerous');
  });

  it('should detect exec option in find command correctly', () => {
    // テスト用設定
    const mockConfig = {
      allowedDirectories: ['/', '/tmp'],
      allowCommands: ['ls', 'cat', 'echo', 'find', 'chmod'],
      denyCommands: [{ command: 'rm', message: 'rm is dangerous' }],
      defaultErrorMessage: 'Command not allowed',
    };
    vi.spyOn(configLoader, 'getConfig').mockReturnValue(mockConfig);

    // findコマンドとchmodは単体では允可されているが、組み合わせまではチェックしない
    expect(validateCommandWithArgs('find . -type f').isValid).toBe(true);
    expect(validateCommandWithArgs('chmod 644 file.txt').isValid).toBe(true);

    // 複合コマンドをチェックするときに-execオプションも確認される
    const chmodResult = validateMultipleCommands('find . -type f -exec chmod 644 {} ;');
    expect(chmodResult.isValid).toBe(true);

    // rmを実行する場合はブラックリストで開始される
    const rmResult = validateMultipleCommands('find . -type f -exec rm {} ;');
    expect(rmResult.isValid).toBe(false);
    expect(rmResult.message).toBe('rm is dangerous');
    expect(rmResult.command).toContain('find . -type f -exec rm');
  });

  it('should handle brace and parenthesis groups', () => {
    const result1 = validateMultipleCommands('{ ls -la; echo test; }');
    expect(result1.isValid).toBe(true);

    const result2 = validateMultipleCommands('(ls -la; echo test)');
    expect(result2.isValid).toBe(true);
  });

  it('should handle blocked commands in groups', () => {
    const result1 = validateMultipleCommands('{ ls -la; rm -rf /; echo test; }');
    expect(result1.isValid).toBe(false);

    const result2 = validateMultipleCommands('(ls -la; rm -rf /; echo test)');
    expect(result2.isValid).toBe(false);
  });

  it('should reject commands with output redirection', () => {
    const result1 = validateMultipleCommands('ls > file.txt');
    expect(result1.isValid).toBe(false);
    expect(result1.message).toContain('Output redirection is not allowed');

    const result2 = validateMultipleCommands('echo "hello" >> log.txt');
    expect(result2.isValid).toBe(false);
    expect(result2.message).toContain('Output redirection is not allowed');
  });

  it('should reject commands with output redirection in complex expressions', () => {
    const result1 = validateMultipleCommands('cat file.txt | grep pattern > output.txt');
    expect(result1.isValid).toBe(false);
    expect(result1.message).toContain('Output redirection is not allowed');

    const result2 = validateMultipleCommands('find . -name "*.txt" -exec cat {} ; > results.txt');
    expect(result2.isValid).toBe(false);
    expect(result2.message).toContain('Output redirection is not allowed');
  });
});
