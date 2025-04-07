import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { logBlockedCommand } from '../logger.js';
import * as configLoader from '../config/config-loader.js';

describe('logger', () => {
  const testLogPath = '/tmp/mcp-whitelist-shell-test/block.log';
  const testConfig = {
    allowedDirectories: [],
    allowCommands: [],
    denyCommands: [],
    defaultErrorMessage: 'Command not allowed',
    blockLogPath: testLogPath, // Specify log path to enable logging
  };

  beforeEach(() => {
    // Mock the config loader to return our test config
    vi.spyOn(configLoader, 'getConfig').mockReturnValue(testConfig);

    // Ensure the test log directory exists
    const logDir = path.dirname(testLogPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Remove the test log file if it exists
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }
  });

  afterEach(() => {
    // Clean up the test log file
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }

    // Restore all mocks
    vi.restoreAllMocks();
  });

  it('should log blocked commands to the specified file', () => {
    // Call the logBlockedCommand function
    const testCommand = 'rm -rf /';
    const testErrorMessage = 'Dangerous command not allowed';
    logBlockedCommand(testCommand, testErrorMessage);

    // Check if the log file was created and contains the expected content
    expect(fs.existsSync(testLogPath)).toBe(true);
    const logContent = fs.readFileSync(testLogPath, 'utf-8');
    expect(logContent).toContain('BLOCKED COMMAND: rm -rf /');
    expect(logContent).toContain('REASON: Dangerous command not allowed');
  });

  it('should handle errors when writing to the log file', () => {
    // Mock fs.appendFileSync to throw an error
    const mockAppendFileSync = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {
      throw new Error('Test error');
    });

    // Mock console.error to capture the error message
    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Call the logBlockedCommand function
    logBlockedCommand('test command', 'test error');

    // Verify that console.error was called with the expected error message
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Error writing to block log')
    );

    // Clean up
    mockAppendFileSync.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('should not log when blockLogPath is undefined', () => {
    // Create a config without a log path to disable logging
    const disabledLoggingConfig = {
      ...testConfig,
      blockLogPath: undefined,
    };

    // Mock the config loader to return our disabled logging config
    vi.spyOn(configLoader, 'getConfig').mockReturnValue(disabledLoggingConfig);

    // Spy on the fs.appendFileSync function
    const appendFileSpy = vi.spyOn(fs, 'appendFileSync');

    // Call the logBlockedCommand function
    logBlockedCommand('test command', 'test error');

    // Verify that appendFileSync was not called since logging is disabled
    expect(appendFileSpy).not.toHaveBeenCalled();

    // Clean up
    appendFileSpy.mockRestore();
  });
});
