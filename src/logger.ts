import fs from 'fs';
import path from 'path';
import { getConfig } from './config/config-loader.js';
import { ValidationResult } from './command-validator.js';

/**
 * ブロックされたコマンドのログを記録する関数
 * @param command ブロックされたコマンド
 * @param errorMessage ブロックの理由
 * @param blockReason ブロックに関する詳細情報
 */
export function logBlockedCommand(
  command: string,
  validationResult: ValidationResult | string
): void {
  try {
    const config = getConfig();

    // blockLogPathが未指定の場合はログを記録しない
    if (!config.blockLogPath) {
      return;
    }

    const logPath = config.blockLogPath;

    // ログファイルのディレクトリを確保
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // 現在の日時を取得
    const timestamp = new Date().toISOString();

    // ログメッセージを生成
    let logMessage = `[${timestamp}] BLOCKED COMMAND: ${command}`;
    if (typeof validationResult === 'object') {
      logMessage += `\n | REASON: ${validationResult.message}`;
      logMessage += `\n | BASE_COMMAND: ${validationResult.baseCommand}`;
      logMessage += `\n | ALLOWED_COMMANDS: ${validationResult.allowedCommands
        .map((cmd) => (typeof cmd === 'string' ? cmd : cmd.command))
        .join(', ')}`;
      logMessage += `\n | BLOCK_REASON: ${validationResult.blockReason?.location}`;
      if (validationResult.blockReason?.denyCommand) {
        const denyCmd = validationResult.blockReason.denyCommand;
        const cmdName = typeof denyCmd === 'string' ? denyCmd : denyCmd.command;
        logMessage += `\n | DENY_COMMAND: ${cmdName}`;

        if (typeof denyCmd === 'object' && denyCmd.message) {
          logMessage += `\n | DENY_MESSAGE: ${denyCmd.message}`;
        }
      }
    } else {
      logMessage += ` | VALIDATION_RESULT: ${validationResult}`;
    }

    logMessage += '\n';

    // ログファイルに追記
    fs.appendFileSync(logPath, logMessage);
  } catch (error) {
    // ログ書き込みのエラーは単にコンソールに出力する
    console.error(`Error writing to block log: ${error}`);
  }
}
