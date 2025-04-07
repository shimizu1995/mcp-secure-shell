import fs from 'fs';
import path from 'path';
import { getConfig } from './config/config-loader.js';

import { DenyCommand } from './config/shell-command-config.js';

type BlockReason = {
  denyCommand?: DenyCommand;
  location: string;
};

/**
 * ブロックされたコマンドのログを記録する関数
 * @param command ブロックされたコマンド
 * @param errorMessage ブロックの理由
 * @param blockReason ブロックに関する詳細情報
 */
export function logBlockedCommand(
  command: string,
  errorMessage: string,
  blockReason?: BlockReason
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
    let logMessage = `[${timestamp}] BLOCKED COMMAND: ${command} | REASON: ${errorMessage}`;

    // ブロック理由の詳細を追加
    if (blockReason) {
      logMessage += ` | LOCATION: ${blockReason.location}`;

      if (blockReason.denyCommand) {
        const denyCmd = blockReason.denyCommand;
        const cmdName = typeof denyCmd === 'string' ? denyCmd : denyCmd.command;
        logMessage += ` | DENY_COMMAND: ${cmdName}`;

        if (typeof denyCmd === 'object' && denyCmd.message) {
          logMessage += ` | DENY_MESSAGE: ${denyCmd.message}`;
        }
      }
    }

    logMessage += '\n';

    // ログファイルに追記
    fs.appendFileSync(logPath, logMessage);
  } catch (error) {
    // ログ書き込みのエラーは単にコンソールに出力する
    console.error(`Error writing to block log: ${error}`);
  }
}
