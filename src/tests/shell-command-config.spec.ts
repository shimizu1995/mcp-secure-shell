import { describe, it, expect } from 'vitest';
import { isRegexPattern, getRegexFromPattern } from '../config/shell-command-config.js';

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
});
