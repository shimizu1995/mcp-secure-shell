import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleShellCommand, validateCommand } from '../shell-command-handler.js';
import commandExists from 'command-exists';

// Mock the command-exists library to make it testable
vi.mock('command-exists', () => {
  return {
    default: vi.fn().mockImplementation(() => Promise.resolve(true)),
  };
});

// Do not mock execa to test with real command execution

describe('validateCommand', () => {
  it('should return true for whitelisted commands', () => {
    expect(validateCommand('ls')).toBe(true);
    expect(validateCommand('cat')).toBe(true);
    expect(validateCommand('echo')).toBe(true);
  });

  it('should return false for non-whitelisted commands', () => {
    expect(validateCommand('rm')).toBe(false);
    expect(validateCommand('sudo')).toBe(false);
    expect(validateCommand('malicious-command')).toBe(false);
  });
});

describe('handleShellCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should execute a whitelisted command', async () => {
    // Override the mock to return true for this test case
    vi.mocked(commandExists).mockImplementation(() => Promise.resolve(true));

    const result = await handleShellCommand('echo "test command execution"');

    // Verify the expected output structure
    expect(result).toHaveProperty('content');
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(result.content[0]).toHaveProperty('mimeType', 'text/plain');
    expect(result.content[0].text).toContain('test command execution');

    // Check if commandExists was called with the correct argument
    expect(commandExists).toHaveBeenCalledWith('echo');
  });

  it('should return an error for non-existent commands', async () => {
    // Override the mock to return false for this test case
    vi.mocked(commandExists).mockImplementation(() => Promise.resolve(false));

    const result = await handleShellCommand('nonexistent-command');

    // Verify error is returned
    expect(result.content[0].text).toContain('Command not found');
    expect(commandExists).toHaveBeenCalledWith('nonexistent-command');
  });

  it('should return an error for non-whitelisted commands', async () => {
    // Override the mock to return true for this test case
    vi.mocked(commandExists).mockImplementation(() => Promise.resolve(true));

    const result = await handleShellCommand('rm -rf /');

    // Verify error is returned
    expect(result.content[0].text).toContain('Command not allowed');
    expect(commandExists).toHaveBeenCalledWith('rm');
  });

  it('should handle execution errors gracefully', async () => {
    // Override the mock to return true for this test case
    vi.mocked(commandExists).mockImplementation(() => Promise.resolve(true));

    // Use a command that will fail (passing invalid argument to echo)
    const result = await handleShellCommand('cat /nonexistent_file_123456789');

    // Verify error is returned and handled properly
    expect(result).toHaveProperty('content');
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(result.content[0]).toHaveProperty('mimeType', 'text/plain');
    // The exact error message will depend on the OS, but should contain some error text
    expect(result.content[0].text).toBeTruthy();
  });
});
