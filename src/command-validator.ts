import { getConfig } from './config/config-loader.js';
import { AllowCommand, DenyCommand } from './config/shell-command-config.js';
import {
  findCommandInAllowlist,
  getDenyCommandName,
  getDenyCommandMessage,
} from './utils/command-utils.js';
import {
  COMMANDS_THAT_EXECUTE_OTHER_COMMANDS,
  validateCommandExecCommand,
} from './command-exec-validator.js';

// シェル演算子の正規表現パターン
const SHELL_OPERATORS_REGEX = /([;|&]|&&|\|\||\(|\)|\{|\})/g;

// 出力リダイレクトの正規表現パターン
const OUTPUT_REDIRECTION_REGEX = /(\s+>>|\s+>)(?![^"']*["']\s*$)/g;

// コマンド置換の正規表現パターン
const COMMAND_SUBSTITUTION_REGEX = /\$\([^)]+\)/g;

/**
 * コマンド文字列に出力リダイレクトが含まれているかチェックする
 * @param commandString 検証するコマンド文字列
 * @returns 出力リダイレクトが含まれている場合はエラーメッセージ、含まれていない場合はnull
 */
export function checkForOutputRedirection(commandString: string): string | null {
  // 引用符内のリダイレクト記号を無視し、コマンド内の実際のリダイレクトを検出
  const matches = commandString.match(OUTPUT_REDIRECTION_REGEX);

  if (matches) {
    const redirectionType = matches[0].includes('>>') ? 'append' : 'overwrite';
    return `Output redirection is not allowed. ${redirectionType} redirection operator (${matches[0]}) detected.`;
  }

  return null;
}

export type ValidationResult = {
  isValid: boolean;
  message: string;
  command: string;
  baseCommand: string;
  allowedCommands: AllowCommand[];
  blockReason?: {
    denyCommand?: DenyCommand;
    location: string;
  };
};

/**
 * コマンドが許可リストに登録されているか検証する関数
 * サブコマンドも含めて検証、およびブラックリストの確認も行う
 * @param command コマンド文字列
 * @returns 許可されるかどうかのブール値
 */
export function validateCommandWithArgs(command: string): ValidationResult {
  const config = getConfig();
  const parts = command.trim().split(/\s+/);
  const baseCommand = parts[0];

  const result: ValidationResult = {
    isValid: false,
    command,
    baseCommand,
    message: '',
    allowedCommands: config.allowCommands,
  };

  if (!baseCommand) {
    return {
      ...result,
      message: 'empty command',
      blockReason: { location: 'validateCommandWithArgs:emptyCommand' },
    };
  }

  const blacklistedCmd = config.denyCommands.find((denyCmd) => {
    const cmdName = getDenyCommandName(denyCmd);
    return cmdName === baseCommand;
  });

  if (blacklistedCmd) {
    return {
      ...result,
      message: getDenyCommandMessage(blacklistedCmd, config),
      blockReason: {
        denyCommand: blacklistedCmd,
        location: 'validateCommandWithArgs:blacklistedBaseCommand',
      },
    };
  }

  if (COMMANDS_THAT_EXECUTE_OTHER_COMMANDS.includes(baseCommand)) {
    // Validate commands executed by other commands (like xargs or find -exec)
    const execCommandResult = validateCommandExecCommand(baseCommand, command, config, result);
    if (execCommandResult) {
      return execCommandResult;
    }
  }

  // 直接findCommandInAllowlistを使って許可リストチェックを行う
  const matchedCommand = findCommandInAllowlist(baseCommand, config.allowCommands);
  if (!matchedCommand) {
    return {
      ...result,
      message: `${config.defaultErrorMessage}: ${baseCommand}`,
      blockReason: {
        location: 'validateCommandWithArgs:commandNotInAllowlist',
      },
    };
  }

  if (typeof matchedCommand === 'string') {
    return { ...result, isValid: true, message: 'allowed command(string config)' };
  }

  // 後は特定の設定に基づいたサブコマンドのチェック
  if (parts.length > 1) {
    const subCommand = parts[1];

    if (matchedCommand.denySubCommands && matchedCommand.denySubCommands.includes(subCommand)) {
      return {
        ...result,
        message: `${config.defaultErrorMessage}: ${baseCommand} ${subCommand}`,
        blockReason: {
          location: 'validateCommandWithArgs:deniedSubcommand',
          denyCommand: { command: `${baseCommand} ${subCommand}` },
        },
      };
    }

    if (matchedCommand.subCommands) {
      const isValid = matchedCommand.subCommands.includes(subCommand);
      return {
        ...result,
        isValid,
        message: isValid
          ? 'allowed subcommand'
          : `${config.defaultErrorMessage}: ${baseCommand} ${subCommand}`,
        ...(!isValid && {
          blockReason: {
            location: 'validateCommandWithArgs:subcommandNotInAllowlist',
            denyCommand: { command: `${baseCommand} ${subCommand}` },
          },
        }),
      };
    }
  }

  return { ...result, isValid: true, message: 'allowed command(object config)' };
}

/**
 * 複数のコマンドが組み合わされた文字列から個々のコマンドを抽出する
 * 例: "ls -la; cat file | grep pattern && echo done"
 */
export function extractCommands(commandString: string): string[] {
  // 結果のコマンドリスト
  const commands: string[] = [];

  // find -exec コマンドの特別処理
  const isFindExecCommand =
    commandString.trim().startsWith('find') && commandString.includes('-exec');

  // findコマンドとその後に続くコマンドの分割
  if (isFindExecCommand) {
    // &&や;で結合されたコマンドを分割
    // ここでは\\;（エスケープされたセミコロン）と;（読みのセミコロン）を区別する
    const parts = [];
    let currentPart = '';
    let i = 0;

    // 文字ごとに処理して\;と通常の;を区別する
    while (i < commandString.length) {
      // 現在の文字と次の文字を取得
      const currentChar = commandString[i];
      const nextChar = i < commandString.length - 1 ? commandString[i + 1] : '';
      const prev2Chars = i >= 2 ? commandString.substring(i - 2, i) : '';

      // エスケープされたセミコロン\;の場合はそのまま追加
      if (currentChar === ';' && prev2Chars.endsWith('\\')) {
        currentPart += currentChar;
      }
      // &&演算子を検出した場合はコマンドを分割
      else if (currentChar === '&' && nextChar === '&') {
        if (currentPart.trim()) {
          parts.push(currentPart.trim());
        }
        currentPart = '';
        i++; // &&の2文字目をスキップ
      }
      // 通常のセミコロンの場合はコマンドを分割
      else if (currentChar === ';' && !prev2Chars.endsWith('\\')) {
        if (currentPart.trim()) {
          parts.push(currentPart.trim());
        }
        currentPart = '';
      }
      // 通常の文字はそのまま追加
      else {
        currentPart += currentChar;
      }

      i++;
    }

    // 最後の部分を追加
    if (currentPart.trim()) {
      parts.push(currentPart.trim());
    }

    // 特別なケースを処理する
    if (parts.length === 0 && commandString.trim()) {
      // 分割できなかった場合は全体を一つのコマンドとして追加
      return [commandString.trim()];
    }

    return parts;
  }

  // 引用符内のコンテンツを一時的にプレースホルダーに置き換え
  let processedCommand = commandString;
  const quotedStrings: string[] = [];

  // 引用符で囲まれた部分（ダブルクォートとシングルクォート）を検出して置き換え
  const doubleQuotePattern = /"([^"]*)"/g;
  const singleQuotePattern = /'([^']*)'/g;

  processedCommand = processedCommand.replace(doubleQuotePattern, (match) => {
    quotedStrings.push(match);
    return `__QUOTE${quotedStrings.length - 1}__`;
  });

  processedCommand = processedCommand.replace(singleQuotePattern, (match) => {
    quotedStrings.push(match);
    return `__QUOTE${quotedStrings.length - 1}__`;
  });

  // エスケープされたセミコロンやその他の特殊文字をプレースホルダーに置き換え
  const escapedCharPattern = /\\([;&|])/g;
  const escapedChars: string[] = [];
  processedCommand = processedCommand.replace(escapedCharPattern, (match) => {
    escapedChars.push(match);
    return `__ESCAPED${escapedChars.length - 1}__`;
  });

  // コマンド置換を検出して処理
  const substitutions = processedCommand.match(COMMAND_SUBSTITUTION_REGEX) || [];

  // コマンド置換内のコマンドを抽出
  substitutions.forEach((subst) => {
    // $() 内のコマンドを抽出
    const innerCommand = subst.substring(2, subst.length - 1).trim();
    if (innerCommand) {
      // 再帰的にコマンド置換内のコマンドも処理
      const innerCommands = extractCommands(innerCommand);
      commands.push(...innerCommands);
    }
  });

  // 元のコマンド文字列からコマンド置換部分を一時的に除去
  substitutions.forEach((subst, index) => {
    processedCommand = processedCommand.replace(subst, `__SUBST${index}__`);
  });

  // 基本的なシェル演算子でコマンドを分割
  // -exec オプションと他のオプションを区別するために改良
  let parts: string[] = [];

  // 演算子で分割する前に、特定のパターン（find -exec など）を識別
  if (processedCommand.includes('-exec') && processedCommand.trim().startsWith('find')) {
    // find -exec コマンドが含まれている場合は単一コマンドとして扱う
    parts = [processedCommand.trim()];
  } else {
    // 通常の分割処理
    parts = processedCommand
      .split(SHELL_OPERATORS_REGEX)
      .filter(Boolean)
      .map((part) => part.trim());
  }

  // 演算子ではない部分（実際のコマンド）だけを取得
  const basicCommands = parts.filter((part) => {
    return !part.match(/^([;|&]|&&|\|\||\(|\)|\{|\})$/) && !part.match(/^__SUBST\d+__$/); // 置換されたパターンは除外
  });

  // 元のコマンド文字列のプレースホルダーを元に戻す
  const restoredCommands = basicCommands.map((cmd) => {
    let restoredCmd = cmd;

    // 引用符のプレースホルダーを元に戻す
    quotedStrings.forEach((quotedStr, idx) => {
      const placeholder = `__QUOTE${idx}__`;
      while (restoredCmd.includes(placeholder)) {
        restoredCmd = restoredCmd.replace(placeholder, quotedStr);
      }
    });

    // エスケープされた文字を元に戻す
    escapedChars.forEach((escapedChar, idx) => {
      const placeholder = `__ESCAPED${idx}__`;
      while (restoredCmd.includes(placeholder)) {
        restoredCmd = restoredCmd.replace(placeholder, escapedChar);
      }
    });

    return restoredCmd;
  });

  // 分割されたコマンドを追加
  commands.push(...restoredCommands);

  // 複合コマンドの特別なケースを処理
  // シェル演算子が含まれないコマンドの場合、オリジナルのコマンドを確認
  if (commands.length === 0 && commandString.trim() !== '') {
    commands.push(commandString.trim());
  }

  return commands.filter(Boolean);
}

/**
 * 複数のコマンドを含むコマンド文字列が全て許可リストに含まれているか検証
 * @returns 検証結果
 */
export function validateMultipleCommands(commandString: string): ValidationResult {
  const config = getConfig();

  // リダイレクトチェックを先に行う
  const redirectionError = checkForOutputRedirection(commandString);
  if (redirectionError) {
    return {
      isValid: false,
      baseCommand: '',
      command: commandString,
      message: redirectionError,
      allowedCommands: config.allowCommands,
      blockReason: {
        location: 'validateMultipleCommands:redirectionError',
      },
    };
  }

  // find -exec コマンドの特別処理
  if (commandString.includes('-exec') && commandString.trim().startsWith('find')) {
    // find -exec は許可するが、-exec オプション後のコマンドも確認する
    const execCommandResult = validateCommandExecCommand('find', commandString, config, {
      isValid: false,
      command: commandString,
      baseCommand: 'find',
      message: '',
      allowedCommands: config.allowCommands,
    });

    if (execCommandResult) {
      return execCommandResult;
    }

    // 許可されている場合は先に進む
  }

  // 個々のコマンドを抽出
  const commands = extractCommands(commandString);

  // コマンドが空の場合は拒否
  if (commands.length === 0) {
    return {
      isValid: false,
      baseCommand: '',
      command: commandString,
      message: 'empty command',
      allowedCommands: config.allowCommands,
      blockReason: {
        location: 'validateMultipleCommands:emptyCommand',
      },
    };
  }

  // 各コマンドが許可リストに含まれているか検証
  for (const cmd of commands) {
    // 各コマンドにもリダイレクトチェックを適用
    const cmdRedirectionError = checkForOutputRedirection(cmd);
    if (cmdRedirectionError) {
      return {
        isValid: false,
        baseCommand: '',
        command: cmd,
        message: cmdRedirectionError,
        allowedCommands: config.allowCommands,
        blockReason: {
          location: 'validateMultipleCommands:subcommandRedirectionError',
        },
      };
    }

    const result = validateCommandWithArgs(cmd);
    if (!result.isValid) {
      return result;
    }
  }
  return {
    isValid: true,
    baseCommand: commands[0],
    command: commandString,
    allowedCommands: config.allowCommands,
    message: 'all commands are allowed',
  };
}
