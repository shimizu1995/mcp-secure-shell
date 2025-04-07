import fs from 'fs';
import path from 'path';
import { getConfig } from './config/config-loader.js';

/**
 * ブロックされたコマンドのログを記録する関数
 * @param command ブロックされたコマンド
 * @param errorMessage ブロックの理由
 */
export function logBlockedCommand(command: string, errorMessage: string): void {
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
    const logMessage = `[${timestamp}] BLOCKED COMMAND: ${command} | REASON: ${errorMessage}\n`;

    // ログファイルに追記
    fs.appendFileSync(logPath, logMessage);
  } catch (error) {
    // ログ書き込みのエラーは単にコンソールに出力する
    console.error(`Error writing to block log: ${error}`);
  }
}
