import { describe, it, expect } from 'vitest';
import {
  isRegexPattern,
  getRegexFromPattern,
  DEFAULT_CONFIG,
} from '../config/shell-command-config.js';

describe('Shell Command Config Utilities', () => {
  describe('isRegexPattern', () => {
    it('should identify regex patterns correctly', () => {
      expect(isRegexPattern('regex:.*pattern.*')).toBe(true);
      expect(isRegexPattern('regex:[a-z]+')).toBe(true);
      expect(isRegexPattern('regex:^sudo$')).toBe(true);
    });

    it('should return false for non-regex patterns', () => {
      expect(isRegexPattern('normal-command')).toBe(false);
      expect(isRegexPattern('sudo')).toBe(false);
      expect(isRegexPattern('regex')).toBe(false); // missing colon
      expect(isRegexPattern('regexs:pattern')).toBe(false); // wrong prefix
    });
  });

  describe('getRegexFromPattern', () => {
    it('should create a valid RegExp object from pattern', () => {
      const regex = getRegexFromPattern('regex:.*sudo.*');
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.test('use sudo command')).toBe(true);
      expect(regex.test('no matching here')).toBe(false);
    });

    it('should handle various regex patterns', () => {
      // 数字のみのパターン
      const numRegex = getRegexFromPattern('regex:\\d+');
      expect(numRegex.test('123')).toBe(true);
      expect(numRegex.test('abc')).toBe(false);

      // 単語境界パターン
      const wordRegex = getRegexFromPattern('regex:\\brm\\b');
      expect(wordRegex.test('rm -rf')).toBe(true);
      expect(wordRegex.test('farm')).toBe(false);

      // 否定パターン
      const negationRegex = getRegexFromPattern('regex:[^a-z]');
      expect(negationRegex.test('A')).toBe(true);
      expect(negationRegex.test('a')).toBe(false);
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have required properties', () => {
      expect(DEFAULT_CONFIG).toHaveProperty('allowCommands');
      expect(DEFAULT_CONFIG).toHaveProperty('denyCommands');
      expect(DEFAULT_CONFIG).toHaveProperty('defaultErrorMessage');
    });

    it('should include common commands in allowCommands', () => {
      expect(DEFAULT_CONFIG.allowCommands).toBeDefined();
      expect(DEFAULT_CONFIG.allowCommands).toBeInstanceOf(Array);
      expect(DEFAULT_CONFIG.allowCommands.length).toBeGreaterThan(0);

      // gitコマンドがObjectタイプであることを確認
      const gitCommand = DEFAULT_CONFIG.allowCommands.find(
        (cmd) => typeof cmd === 'object' && cmd.command === 'git'
      );
      expect(gitCommand).toBeDefined();
      expect(typeof gitCommand !== 'string').toBe(true);
      if (typeof gitCommand === 'object') {
        expect(gitCommand).toHaveProperty('subCommands');
      }
    });

    it('should include dangerous commands in denyCommands', () => {
      expect(DEFAULT_CONFIG.denyCommands).toBeDefined();
      expect(DEFAULT_CONFIG.denyCommands).toBeInstanceOf(Array);

      // rmコマンドを検索
      const rmCommand = DEFAULT_CONFIG.denyCommands.find(
        (cmd) => typeof cmd === 'object' && cmd.command === 'rm'
      );
      expect(rmCommand).toBeDefined();
      if (typeof rmCommand === 'object') {
        expect(rmCommand).toHaveProperty('message');
      }

      // 正規表現パターンの確認
      const regexCommand = DEFAULT_CONFIG.denyCommands.find(
        (cmd) => typeof cmd === 'object' && 'command' in cmd && isRegexPattern(cmd.command)
      );
      expect(regexCommand).toBeDefined();
      if (regexCommand && typeof regexCommand === 'object') {
        expect(regexCommand.command).toContain('sudo');
      }
    });
  });
});
