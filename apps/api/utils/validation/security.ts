/**
 * Security Utilities
 * Path sanitization, filename validation, and secure ID generation
 */

import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import type { PathSanitizationOptions } from './types.js';

/**
 * Sanitize and validate a path to prevent directory traversal attacks
 */
export function sanitizePath(
  userInput: any,
  baseDir: string,
  options: PathSanitizationOptions = {}
): string {
  if (!userInput || typeof userInput !== 'string') {
    throw new Error('Invalid path input: must be a non-empty string');
  }

  if (!baseDir || typeof baseDir !== 'string') {
    throw new Error('Invalid base directory: must be a non-empty string');
  }

  if (userInput.includes('\0')) {
    throw new Error('Invalid path: contains null bytes');
  }

  const normalizedInput = path.normalize(userInput);
  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(resolvedBase, normalizedInput);

  if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
    throw new Error(`Path traversal detected: path must be within ${resolvedBase}`);
  }

  const dangerousPatterns = [
    /\.\./,
    /[;&|`$()]/,
    /\s*>/,
    /\s*</,
    /[<>:"|?*]/,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(userInput)) {
      throw new Error('Invalid path: contains dangerous characters or patterns');
    }
  }

  if (options.createDir) {
    const parentDir = path.dirname(resolvedPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  }

  return resolvedPath;
}

/**
 * Sanitize a filename for safe filesystem use
 */
export function sanitizeFilename(filename: any, fallback: string = 'file'): string {
  if (!filename || typeof filename !== 'string') {
    return fallback;
  }

  const sanitized = filename
    .replace(/[\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.\./g, '_')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 255);

  return sanitized || fallback;
}

/**
 * Generate a secure random ID
 */
export function generateSecureId(bytes: number = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export default {
  sanitizePath,
  sanitizeFilename,
  generateSecureId
};
