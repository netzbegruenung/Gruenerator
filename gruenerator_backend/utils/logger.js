/**
 * Centralized logging utility with environment-based log levels
 * Usage: Set LOG_LEVEL=debug|verbose|info|warn|error
 */

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const LOG_LEVELS = {
  debug: 0,
  verbose: 1, 
  info: 2,
  warn: 3,
  error: 4
};

const currentLevel = LOG_LEVELS[LOG_LEVEL] || LOG_LEVELS.info;

class Logger {
  static debug(message, ...args) {
    if (currentLevel <= LOG_LEVELS.debug) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  static verbose(message, ...args) {
    if (currentLevel <= LOG_LEVELS.verbose) {
      console.log(`[VERBOSE] ${message}`, ...args);
    }
  }

  static info(message, ...args) {
    if (currentLevel <= LOG_LEVELS.info) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  static warn(message, ...args) {
    if (currentLevel <= LOG_LEVELS.warn) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  static error(message, ...args) {
    if (currentLevel <= LOG_LEVELS.error) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  // Helper methods for common patterns
  static isDebugMode() {
    return currentLevel <= LOG_LEVELS.debug;
  }

  static isVerboseMode() {
    return currentLevel <= LOG_LEVELS.verbose;
  }
}

module.exports = { Logger, LOG_LEVEL, LOG_LEVELS };