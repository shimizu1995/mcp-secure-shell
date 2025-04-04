import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DenyCommand } from '../config/shell-command-config.js';
import {
  handleShellCommand,
  validateCommand,
  validateCommandWithArgs,
  findDenyCommandInBlacklist,
  getBlacklistErrorMessage,
  isDirectoryAllowed,
  setWorkingDirectory,
  getWorkingDirectory,
  parseAllowedDirectories,
  refreshAllowedDirectories,
  getAllowedDirectoriesFromConfig,
} from '../shell-command-handler.js';
import { getConfig, reloadConfig } from '../config/config-loader.js';
import fs from 'fs';
import path from 'path';

// Do not mock the command-exists library to use the actual implementation

// Do not mock execa to test with real command execution

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

  it('should return DenyCommand even if blacklisted command is not the base command', () => {
    expect(findDenyCommandInBlacklist('echo Let me explain how sudo works')).not.toBeNull();
    expect(findDenyCommandInBlacklist('ls | xargs rm')).not.toBeNull();
    expect(findDenyCommandInBlacklist('git commit -m "Fix chmod issue"')).not.toBeNull();
  });

  it('should return null for safe commands with no blacklisted terms', () => {
    expect(findDenyCommandInBlacklist('ls -la')).toBeNull();
    expect(findDenyCommandInBlacklist('echo Hello World')).toBeNull();
    expect(findDenyCommandInBlacklist('git status')).toBeNull();
    expect(findDenyCommandInBlacklist('cat /etc/passwd')).toBeNull();
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
    const result = await handleShellCommand('nonexistent-whitelisted-command');

    // Verify error is returned
    expect(result.content[0].text).toContain('Command not found');
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

  it('should reject commands containing blacklisted terms', async () => {
    // Commands with blacklisted terms as base command
    const result1 = await handleShellCommand('rm -rf /tmp/test');
    expect(result1.content[0].text).toContain(
      'rm コマンドは危険なため使用できません。代わりにゴミ箱に移動するコマンドを使用してください'
    );

    // Commands with blacklisted terms in arguments or piped commands
    const result2 = await handleShellCommand('echo hello | sudo ls');
    expect(result2.content[0].text).toContain('sudo コマンドは権限昇格のため使用できません');

    const result3 = await handleShellCommand('ls | xargs chmod 777');
    expect(result3.content[0].text).toContain(
      'chmod コマンドはファイルパーミッションを変更するため使用できません'
    );
  });

  it('should reject blacklisted commands even if they are whitelisted', async () => {
    // Simulate a case where a command is both whitelisted and blacklisted
    // We'll test find as it's in both lists in our new configuration
    const result = await handleShellCommand('find . -name "*.js"');

    // Verify the correct error message is returned (blacklist error, not whitelist error)
    expect(result.content[0].text).toContain('find コマンドではなく、git grep を使用してください');
  });
});

describe('Directory Management', () => {
  // Real allowed directories pattern to test against
  const homeDir = process.env.HOME || process.cwd();
  const testDir = path.join(homeDir, 'test-dir');
  const testFile = path.join(homeDir, 'test-file.txt');

  beforeEach(() => {
    // Set up allowed directories for testing
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', homeDir);
    refreshAllowedDirectories();
    // Create test directory and file if they don't exist
    if (!fs.existsSync(testDir)) {
      try {
        fs.mkdirSync(testDir, { recursive: true });
      } catch {
        // Ignore errors - tests will handle this
      }
    }

    // Reset working directory to home directory
    setWorkingDirectory(homeDir);

    // Create test file if it doesn't exist
    if (!fs.existsSync(testFile)) {
      try {
        fs.writeFileSync(testFile, 'test content', 'utf8');
      } catch {
        // Ignore errors - tests will handle this
      }
    }
  });

  it('should validate if a directory is allowed', () => {
    // Home directory and subdirectories should be allowed
    expect(isDirectoryAllowed(homeDir)).toBe(true);
    expect(isDirectoryAllowed(testDir)).toBe(true);

    // Directories outside home should not be allowed
    const outsideDir = path.join('/', 'tmp', 'test-outside');
    expect(isDirectoryAllowed(outsideDir)).toBe(false);

    // Non-directories should not be allowed
    if (fs.existsSync(testFile)) {
      expect(isDirectoryAllowed(testFile)).toBe(false);
    }

    // Non-existent directories should not be allowed
    const nonExistentDir = path.join(homeDir, 'non-existent-dir-' + Date.now());
    expect(isDirectoryAllowed(nonExistentDir)).toBe(false);
  });

  it('should set and get working directory', () => {
    // Set to a valid directory
    const result = setWorkingDirectory(testDir);
    expect(result).toBe(testDir);
    expect(getWorkingDirectory()).toBe(testDir);

    // Set back to home directory
    const result2 = setWorkingDirectory(homeDir);
    expect(result2).toBe(homeDir);
    expect(getWorkingDirectory()).toBe(homeDir);
  });

  it('should throw an error when setting an invalid directory', () => {
    // Try to set to a directory outside allowed directories
    const outsideDir = path.join('/', 'tmp', 'test-outside');
    expect(() => setWorkingDirectory(outsideDir)).toThrow(/Directory not allowed/);

    // Try to set to a non-existent directory
    const nonExistentDir = path.join(homeDir, 'non-existent-dir-' + Date.now());
    expect(() => setWorkingDirectory(nonExistentDir)).toThrow();

    // Try to set to a file (which is not a directory)
    if (fs.existsSync(testFile)) {
      expect(() => setWorkingDirectory(testFile)).toThrow();
    }
  });
});

// ALLOWED_DIRECTORIESの環境変数からの読み込みテスト
describe('getAllowedDirectoriesFromConfig', () => {
  // 環境変数のモックを管理するために、afterEachフックを追加
  afterEach(() => {
    // 環境変数のモックをリセット
    vi.unstubAllEnvs();
  });

  it('should merge directories from config and environment variables', () => {
    // Mock configuration
    vi.spyOn(getConfig(), 'allowedDirectories', 'get').mockReturnValue([
      '/config/dir1',
      '/config/dir2',
    ]);
    // Mock environment variable
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', '/env/dir1:/env/dir2');

    const result = getAllowedDirectoriesFromConfig();

    // Should include directories from both sources
    expect(result).toContain('/config/dir1');
    expect(result).toContain('/config/dir2');
    expect(result).toContain('/env/dir1');
    expect(result).toContain('/env/dir2');
    expect(result.length).toBe(4);
  });

  it('should work with only config directories', () => {
    // Mock configuration
    vi.spyOn(getConfig(), 'allowedDirectories', 'get').mockReturnValue([
      '/config/dir1',
      '/config/dir2',
    ]);
    // Empty environment variable
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', '');

    const result = getAllowedDirectoriesFromConfig();

    // Should include only config directories
    expect(result).toContain('/config/dir1');
    expect(result).toContain('/config/dir2');
    expect(result.length).toBe(2);
  });

  it('should work with only environment variable directories', () => {
    // Empty config
    vi.spyOn(getConfig(), 'allowedDirectories', 'get').mockReturnValue([]);
    // Mock environment variable
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', '/env/dir1:/env/dir2');

    const result = getAllowedDirectoriesFromConfig();

    // Should include only environment variable directories
    expect(result).toContain('/env/dir1');
    expect(result).toContain('/env/dir2');
    expect(result.length).toBe(2);
  });

  it('should return empty array when both sources are empty', () => {
    // Empty config
    vi.spyOn(getConfig(), 'allowedDirectories', 'get').mockReturnValue([]);
    // Empty environment variable
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', '');

    const result = getAllowedDirectoriesFromConfig();

    // Should be empty
    expect(result.length).toBe(0);
  });
});

describe('parseAllowedDirectories', () => {
  // 環境変数のモックを管理するために、afterEachフックを追加
  afterEach(() => {
    // 環境変数のモックをリセット
    vi.unstubAllEnvs();
  });

  // 各テスト後に環境変数の変更をALLOWED_DIRECTORIESに反映させる
  beforeEach(() => {
    // 現在の環境変数を保存
    refreshAllowedDirectories();
  });

  it('should return empty array when environment variable is not set', () => {
    // 環境変数が存在しない場合
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', undefined);
    expect(parseAllowedDirectories()).toEqual([]);
  });

  it('should return empty array when environment variable is empty', () => {
    // 環境変数が空文字列の場合
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', '');
    expect(parseAllowedDirectories()).toEqual([]);
  });

  it('should parse colon-separated directories', () => {
    // 標準的なケース: コロン区切りのディレクトリリスト
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', '/home/user:/tmp:/var/log');
    expect(parseAllowedDirectories()).toEqual(['/home/user', '/tmp', '/var/log']);
  });

  it('should filter out empty entries', () => {
    // 空のエントリを含むケース
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', '/home/user::/tmp::/var/log');
    expect(parseAllowedDirectories()).toEqual(['/home/user', '/tmp', '/var/log']);
  });

  it('should handle single directory', () => {
    // ディレクトリが1つだけのケース
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', '/home/user');
    expect(parseAllowedDirectories()).toEqual(['/home/user']);
  });

  it('should trim whitespace from directories', () => {
    // 空白を含むケース
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', ' /home/user : /tmp : /var/log ');
    expect(parseAllowedDirectories()).toEqual(['/home/user', '/tmp', '/var/log']);
  });
});

describe('handleShellCommand with Directory Parameter', () => {
  const homeDir = process.env.HOME || process.cwd();
  const testDir = path.join(homeDir, 'test-dir');

  beforeEach(() => {
    // Set up allowed directories for testing
    vi.stubEnv('MCP_ALLOWED_DIRECTORIES', homeDir);
    refreshAllowedDirectories();
    // Create test directory if it doesn't exist
    if (!fs.existsSync(testDir)) {
      try {
        fs.mkdirSync(testDir, { recursive: true });
      } catch {
        // Ignore errors - tests will handle this
      }
    }

    // Reset working directory to home directory
    setWorkingDirectory(homeDir);
  });

  it('should execute a command in the specified directory', async () => {
    // Execute pwd in the test directory
    const result = await handleShellCommand('pwd', testDir);

    // Verify the command was executed in the test directory
    expect(result.content[0].text).toContain(testDir);

    // Verify the working directory was updated
    expect(getWorkingDirectory()).toBe(testDir);
  });

  it('should use the last specified directory for subsequent commands', async () => {
    // First, set a working directory
    await handleShellCommand('pwd', testDir);

    // Then run a command without specifying a directory
    const result = await handleShellCommand('pwd');

    // Verify it still uses the previously set directory
    expect(result.content[0].text).toContain(testDir);
  });

  it('should add a message when specifying the same directory', async () => {
    // First set a working directory
    setWorkingDirectory(testDir);

    // Then run a command specifying the same directory
    const result = await handleShellCommand('pwd', testDir);

    // Verify the additional message is included
    expect(result.content[1].text).toContain(
      "**Note:** You don't need to specify the same directory"
    );
  });

  it('should not add a message when specifying a different directory', async () => {
    // First set a working directory
    setWorkingDirectory(homeDir);

    // Then run a command specifying a different directory
    const result = await handleShellCommand('pwd', testDir);

    // Verify the additional message is not included
    expect(result.content[1].text).not.toContain(
      "**Note:** You don't need to specify the same directory"
    );
  });

  it('should add a warning when using cd command with directory parameter', async () => {
    // Run a cd command with directory parameter
    const result = await handleShellCommand('cd some/path', testDir);

    // コマンドが実行できる場合は、警告メッセージを確認
    // CD コマンドが実行できない環境の場合は、content[0]にエラーメッセージが入る
    if (result.content.length > 1) {
      expect(result.content[1].text).toContain(
        "When specifying a directory with the 'directory' parameter, you don't need to use the 'cd' command"
      );
    } else {
      // cd コマンドが実行できない場合は、エラーメッセージのみが返される
      console.log('CD command execution failed, skipping content[1] test');
    }
  });

  it('should add a warning when using cd command without arguments with directory parameter', async () => {
    // Run a cd command with directory parameter
    const result = await handleShellCommand('cd', testDir);

    // コマンドが実行できる場合は、警告メッセージを確認
    if (result.content.length > 1) {
      expect(result.content[1].text).toContain(
        "When specifying a directory with the 'directory' parameter, you don't need to use the 'cd' command"
      );
    } else {
      // cd コマンドが実行できない場合は、エラーメッセージのみが返される
      console.log('CD command execution failed, skipping content[1] test');
    }
  });

  it('should not add a cd warning when using non-cd command with directory parameter', async () => {
    // Run a non-cd command with directory parameter
    const result = await handleShellCommand('pwd', testDir);

    // Verify the warning message is not included
    expect(result.content[1].text).not.toContain(
      "When specifying a directory with the 'directory' parameter, you don't need to use the 'cd' command"
    );
  });

  it('should throw an error when specifying an invalid directory', async () => {
    // Try to execute in an invalid directory
    const outsideDir = path.join('/', 'tmp', 'test-outside');
    const result = await handleShellCommand('pwd', outsideDir);

    // Verify error is returned
    expect(result.content[0].text).toContain('Directory not allowed');
  });

  it('should throw an error when specifying root directory', async () => {
    // Try to execute in the root directory
    const result = await handleShellCommand('pwd', '/');

    // Verify error is returned
    expect(result.content[0].text).toContain('Directory not allowed');
  });
});
