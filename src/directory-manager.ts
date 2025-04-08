import path from 'path';
import fs from 'fs';
import { getConfig } from './config/config-loader.js';

// Gets the allowed directories from config
export function getAllowedDirectoriesFromConfig(): string[] {
  const config = getConfig();
  return [...config.allowedDirectories];
}

// If not set, no directories are allowed
let ALLOWED_DIRECTORIES = getAllowedDirectoriesFromConfig();

// For testing purposes - allows refreshing the allowed directories
export function refreshAllowedDirectories(): void {
  ALLOWED_DIRECTORIES = getAllowedDirectoriesFromConfig();
}

// For testing purposes - gets the current allowed directories
export function getAllowedDirectories(): string[] {
  return [...ALLOWED_DIRECTORIES];
}

// Track the current working directory
let currentWorkingDirectory = process.cwd();

/**
 * Check if a given directory is within any of the allowed directories
 */
export function isDirectoryAllowed(dir: string): boolean {
  // Resolve to absolute path
  const absoluteDir = path.resolve(dir);

  // Check if the directory exists
  try {
    const stats = fs.statSync(absoluteDir);
    if (!stats.isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }

  // Check if it's a subdirectory of any allowed directory
  return ALLOWED_DIRECTORIES.some((allowedDir) => {
    const resolvedAllowedDir = path.resolve(allowedDir);
    return (
      absoluteDir === resolvedAllowedDir || absoluteDir.startsWith(resolvedAllowedDir + path.sep)
    );
  });
}

/**
 * Set the current working directory for command execution
 */
export function setWorkingDirectory(dir: string): string {
  if (!isDirectoryAllowed(dir)) {
    throw new Error(`Directory not allowed: ${dir}. Must be within one of the allowed directories`);
  }

  currentWorkingDirectory = path.resolve(dir);
  return currentWorkingDirectory;
}

/**
 * Get the current working directory
 */
export function getWorkingDirectory(): string {
  return currentWorkingDirectory;
}
