const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/**
 * Sanitize and validate a path to prevent directory traversal attacks
 *
 * This function implements multiple layers of defense:
 * 1. Type validation
 * 2. Null byte injection prevention
 * 3. Path normalization and resolution
 * 4. Directory confinement validation
 * 5. Dangerous pattern detection
 *
 * @param {string} userInput - User-provided input (uploadId, filename, path component, etc.)
 * @param {string} baseDir - Base directory to confine paths to (must be absolute)
 * @param {object} options - Additional options
 * @param {boolean} options.createDir - Create directory if it doesn't exist (default: false)
 * @returns {string} - Sanitized absolute path
 * @throws {Error} - If path is invalid or contains dangerous patterns
 *
 * @example
 * // Safe usage
 * const safePath = sanitizePath('file.txt', '/uploads');
 * // Returns: '/uploads/file.txt'
 *
 * @example
 * // Blocked - path traversal
 * sanitizePath('../../../etc/passwd', '/uploads');
 * // Throws: Error('Path traversal detected')
 */
exports.sanitizePath = (userInput, baseDir, options = {}) => {
  // Type validation
  if (!userInput || typeof userInput !== 'string') {
    throw new Error('Invalid path input: must be a non-empty string');
  }

  if (!baseDir || typeof baseDir !== 'string') {
    throw new Error('Invalid base directory: must be a non-empty string');
  }

  // Remove null bytes (command injection protection)
  if (userInput.includes('\0')) {
    throw new Error('Invalid path: contains null bytes');
  }

  // Normalize and resolve paths
  const normalizedInput = path.normalize(userInput);
  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(resolvedBase, normalizedInput);

  // Ensure path is within base directory (CRITICAL security check)
  if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
    throw new Error(`Path traversal detected: path must be within ${resolvedBase}`);
  }

  // Reject dangerous patterns
  const dangerousPatterns = [
    /\.\./,           // Parent directory traversal
    /[;&|`$()]/,      // Shell metacharacters
    /\s*>/,           // Output redirection
    /\s*</,           // Input redirection
    /[<>:"|?*]/,      // Windows-forbidden characters
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(userInput)) {
      throw new Error('Invalid path: contains dangerous characters or patterns');
    }
  }

  // Optionally create parent directory
  if (options.createDir) {
    const parentDir = path.dirname(resolvedPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  }

  return resolvedPath;
};

/**
 * Sanitize a filename (not full path) for safe filesystem use
 *
 * This function removes or replaces dangerous characters that could:
 * - Enable path traversal attacks
 * - Cause filesystem errors
 * - Enable command injection
 *
 * @param {string} filename - Filename to sanitize
 * @param {string} fallback - Fallback value if sanitization results in empty string (default: 'file')
 * @returns {string} - Sanitized filename
 *
 * @example
 * sanitizeFilename('test..file.txt')
 * // Returns: 'test__file.txt'
 *
 * @example
 * sanitizeFilename('../../../etc/passwd')
 * // Returns: '______etc_passwd'
 */
exports.sanitizeFilename = (filename, fallback = 'file') => {
  if (!filename || typeof filename !== 'string') {
    return fallback;
  }

  const sanitized = filename
    .replace(/[\n\r]+/g, ' ')                          // Remove newlines
    .replace(/\s+/g, ' ')                              // Collapse whitespace
    .replace(/\.\./g, '_')                             // Remove path traversal
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')           // Remove forbidden chars and control chars
    .replace(/^\.+/, '')                               // Remove leading dots
    .trim()
    .slice(0, 255);                                    // Max filename length (filesystem limit)

  return sanitized || fallback;
};

/**
 * Generate a secure random ID for use as uploadId or session identifier
 *
 * @param {number} bytes - Number of random bytes (default: 16)
 * @returns {string} - Hex-encoded random ID
 *
 * @example
 * const uploadId = generateSecureId();
 * // Returns: '3f2a9b8c1d4e5f6a7b8c9d0e1f2a3b4c'
 */
exports.generateSecureId = (bytes = 16) => {
  return crypto.randomBytes(bytes).toString('hex');
};