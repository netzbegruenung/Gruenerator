import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

/**
 * Sanitize and validate a path to prevent directory traversal attacks
 */
export function sanitizePath(userInput, baseDir, options = {}) {
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
export function sanitizeFilename(filename, fallback = 'file') {
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
export function generateSecureId(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}
