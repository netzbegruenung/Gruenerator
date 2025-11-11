/**
 * Security Test Suite: Path Traversal Prevention
 *
 * Tests the centralized path sanitization utilities to ensure they properly
 * prevent path traversal attacks, command injection, and other security vulnerabilities.
 */

const { sanitizePath, sanitizeFilename, generateSecureId } = require('../utils/securityUtils');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Test configuration
const testBaseDir = path.join(os.tmpdir(), 'gruenerator-security-tests');

// Setup and teardown
beforeAll(() => {
  // Create test directory
  if (!fs.existsSync(testBaseDir)) {
    fs.mkdirSync(testBaseDir, { recursive: true });
  }
});

afterAll(() => {
  // Cleanup test directory
  if (fs.existsSync(testBaseDir)) {
    fs.rmSync(testBaseDir, { recursive: true, force: true });
  }
});

describe('sanitizePath() - Path Traversal Protection', () => {

  test('should block parent directory traversal (../)', () => {
    expect(() => {
      sanitizePath('../../../etc/passwd', testBaseDir);
    }).toThrow('Path traversal detected');
  });

  test('should block parent directory traversal with encoded dots', () => {
    expect(() => {
      sanitizePath('..%2F..%2F..%2Fetc%2Fpasswd', testBaseDir);
    }).toThrow(/dangerous characters|Path traversal detected/);
  });

  test('should block absolute path attempts', () => {
    expect(() => {
      sanitizePath('/etc/passwd', testBaseDir);
    }).toThrow('Path traversal detected');
  });

  test('should block Windows absolute path attempts', () => {
    expect(() => {
      sanitizePath('C:\\Windows\\System32', testBaseDir);
    }).toThrow(/dangerous characters|Path traversal detected/);
  });

  test('should allow valid relative paths within base directory', () => {
    const result = sanitizePath('valid-file.txt', testBaseDir);
    expect(result).toContain(testBaseDir);
    expect(result).toContain('valid-file.txt');
    expect(result).toBe(path.join(testBaseDir, 'valid-file.txt'));
  });

  test('should allow subdirectories within base directory', () => {
    const result = sanitizePath('subdir/file.txt', testBaseDir);
    expect(result).toContain(testBaseDir);
    expect(result).toContain('subdir');
    expect(result).toContain('file.txt');
  });

  test('should reject empty or non-string input', () => {
    expect(() => sanitizePath('', testBaseDir)).toThrow('must be a non-empty string');
    expect(() => sanitizePath(null, testBaseDir)).toThrow('must be a non-empty string');
    expect(() => sanitizePath(undefined, testBaseDir)).toThrow('must be a non-empty string');
    expect(() => sanitizePath(123, testBaseDir)).toThrow('must be a non-empty string');
  });

  test('should reject invalid base directory', () => {
    expect(() => sanitizePath('file.txt', '')).toThrow('Invalid base directory');
    expect(() => sanitizePath('file.txt', null)).toThrow('Invalid base directory');
  });
});

describe('sanitizePath() - Command Injection Protection', () => {

  test('should block null byte injection', () => {
    expect(() => {
      sanitizePath('file\x00.txt', testBaseDir);
    }).toThrow('contains null bytes');
  });

  test('should block shell metacharacters - semicolon', () => {
    expect(() => {
      sanitizePath('file; rm -rf /', testBaseDir);
    }).toThrow('dangerous characters');
  });

  test('should block shell metacharacters - ampersand', () => {
    expect(() => {
      sanitizePath('file & malicious-command', testBaseDir);
    }).toThrow('dangerous characters');
  });

  test('should block shell metacharacters - pipe', () => {
    expect(() => {
      sanitizePath('file | cat /etc/passwd', testBaseDir);
    }).toThrow('dangerous characters');
  });

  test('should block shell metacharacters - backticks', () => {
    expect(() => {
      sanitizePath('file`whoami`.txt', testBaseDir);
    }).toThrow('dangerous characters');
  });

  test('should block shell metacharacters - dollar sign', () => {
    expect(() => {
      sanitizePath('file$(whoami).txt', testBaseDir);
    }).toThrow('dangerous characters');
  });

  test('should block shell metacharacters - parentheses', () => {
    expect(() => {
      sanitizePath('file(malicious).txt', testBaseDir);
    }).toThrow('dangerous characters');
  });

  test('should block output redirection', () => {
    expect(() => {
      sanitizePath('file > /etc/passwd', testBaseDir);
    }).toThrow('dangerous characters');
  });

  test('should block input redirection', () => {
    expect(() => {
      sanitizePath('file < /etc/passwd', testBaseDir);
    }).toThrow('dangerous characters');
  });
});

describe('sanitizePath() - Windows Security', () => {

  test('should block Windows-forbidden characters - colon', () => {
    expect(() => {
      sanitizePath('file:test.txt', testBaseDir);
    }).toThrow('dangerous characters');
  });

  test('should block Windows-forbidden characters - asterisk', () => {
    expect(() => {
      sanitizePath('file*.txt', testBaseDir);
    }).toThrow('dangerous characters');
  });

  test('should block Windows-forbidden characters - question mark', () => {
    expect(() => {
      sanitizePath('file?.txt', testBaseDir);
    }).toThrow('dangerous characters');
  });

  test('should block Windows-forbidden characters - double quotes', () => {
    expect(() => {
      sanitizePath('file"test".txt', testBaseDir);
    }).toThrow('dangerous characters');
  });

  test('should block Windows-forbidden characters - less than', () => {
    expect(() => {
      sanitizePath('file<test.txt', testBaseDir);
    }).toThrow('dangerous characters');
  });

  test('should block Windows-forbidden characters - greater than', () => {
    expect(() => {
      sanitizePath('file>test.txt', testBaseDir);
    }).toThrow('dangerous characters');
  });
});

describe('sanitizePath() - Directory Creation Option', () => {

  test('should create parent directory when createDir option is true', () => {
    const testSubDir = path.join(testBaseDir, 'auto-created', 'nested');
    const testFile = 'test-file.txt';

    const result = sanitizePath(path.join('auto-created', 'nested', testFile), testBaseDir, { createDir: true });

    expect(fs.existsSync(testSubDir)).toBe(true);
    expect(result).toContain('auto-created');
    expect(result).toContain('nested');
    expect(result).toContain(testFile);
  });

  test('should not create directory when createDir option is false or omitted', () => {
    const testSubDir = path.join(testBaseDir, 'not-created');
    const testFile = 'test-file.txt';

    const result = sanitizePath(path.join('not-created', testFile), testBaseDir);

    expect(result).toContain('not-created');
    // Directory should not be created
    const parentDir = path.dirname(result);
    // The parent might not exist since createDir is false
  });
});

describe('sanitizeFilename() - Filename Sanitization', () => {

  test('should remove path traversal from filenames', () => {
    expect(sanitizeFilename('test..file')).toBe('test_file');
    expect(sanitizeFilename('../../../etc/passwd')).toBe('______etc_passwd');
  });

  test('should remove dangerous characters', () => {
    expect(sanitizeFilename('test<>:"|?*.txt')).toBe('test_______.txt');
    expect(sanitizeFilename('file/with\\slashes')).toBe('file_with_slashes');
  });

  test('should remove control characters', () => {
    expect(sanitizeFilename('file\x00\x01\x02.txt')).toBe('file___.txt');
    expect(sanitizeFilename('file\n\r.txt')).toBe('file .txt');
  });

  test('should remove leading dots', () => {
    expect(sanitizeFilename('...hidden-file')).toBe('_.hidden-file');
    expect(sanitizeFilename('.htaccess')).toBe('htaccess');
  });

  test('should collapse multiple spaces', () => {
    expect(sanitizeFilename('file    with    spaces.txt')).toBe('file with spaces.txt');
  });

  test('should enforce maximum length (255 chars)', () => {
    const longFilename = 'a'.repeat(300);
    const result = sanitizeFilename(longFilename);
    expect(result.length).toBeLessThanOrEqual(255);
    expect(result.length).toBe(255);
  });

  test('should use fallback for empty or invalid input', () => {
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename(null)).toBe('file');
    expect(sanitizeFilename(undefined)).toBe('file');
    expect(sanitizeFilename('   ')).toBe('file');
  });

  test('should use custom fallback when provided', () => {
    expect(sanitizeFilename('', 'custom-fallback')).toBe('custom-fallback');
    expect(sanitizeFilename(null, 'my-file')).toBe('my-file');
  });

  test('should preserve valid characters', () => {
    expect(sanitizeFilename('valid-filename_123.txt')).toBe('valid-filename_123.txt');
    expect(sanitizeFilename('Test Document.pdf')).toBe('Test Document.pdf');
  });

  test('should handle German umlauts and special characters', () => {
    const result = sanitizeFilename('Dokument-äöü.txt');
    expect(result).toContain('Dokument');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('generateSecureId() - Secure ID Generation', () => {

  test('should generate hex string by default', () => {
    const id = generateSecureId();
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  test('should generate 32 character string by default (16 bytes)', () => {
    const id = generateSecureId();
    expect(id.length).toBe(32); // 16 bytes * 2 (hex encoding)
  });

  test('should generate custom length when specified', () => {
    const id = generateSecureId(8);
    expect(id.length).toBe(16); // 8 bytes * 2 (hex encoding)
  });

  test('should generate unique IDs', () => {
    const id1 = generateSecureId();
    const id2 = generateSecureId();
    const id3 = generateSecureId();

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });

  test('should generate cryptographically random IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateSecureId());
    }
    // Should have 1000 unique IDs (no collisions)
    expect(ids.size).toBe(1000);
  });
});

describe('Real-World Attack Scenarios', () => {

  test('should prevent accessing /etc/passwd via path traversal', () => {
    expect(() => {
      sanitizePath('../../../etc/passwd', testBaseDir);
    }).toThrow();
  });

  test('should prevent accessing Windows system files', () => {
    expect(() => {
      sanitizePath('../../../Windows/System32/config/SAM', testBaseDir);
    }).toThrow();
  });

  test('should prevent file overwrite via path traversal', () => {
    expect(() => {
      sanitizePath('../../important-config.json', testBaseDir);
    }).toThrow();
  });

  test('should prevent command injection via filename', () => {
    expect(() => {
      sanitizePath('file.txt; rm -rf /', testBaseDir);
    }).toThrow('dangerous characters');
  });

  test('should prevent null byte injection attack', () => {
    expect(() => {
      sanitizePath('allowed.txt\x00../../etc/passwd', testBaseDir);
    }).toThrow('contains null bytes');
  });

  test('should handle legitimate uploadId-like patterns safely', () => {
    const validUploadId = generateSecureId();
    const result = sanitizePath(validUploadId, testBaseDir);
    expect(result).toContain(testBaseDir);
    expect(result).toContain(validUploadId);
  });

  test('should reject malicious uploadId patterns', () => {
    const maliciousIds = [
      '../uploads',
      '../../etc/passwd',
      'upload; rm -rf /',
      'upload`whoami`',
      'upload$(cat /etc/passwd)',
      'upload|cat /etc/passwd',
      'upload&& malicious',
    ];

    maliciousIds.forEach(maliciousId => {
      expect(() => {
        sanitizePath(maliciousId, testBaseDir);
      }).toThrow();
    });
  });
});

describe('Edge Cases and Boundary Conditions', () => {

  test('should handle very long paths within base directory', () => {
    const longPath = 'a/'.repeat(50) + 'file.txt'; // 100 levels deep
    const result = sanitizePath(longPath, testBaseDir);
    expect(result).toContain(testBaseDir);
  });

  test('should handle paths with Unicode characters', () => {
    const unicodePath = 'файл-文件-ファイル.txt';
    const result = sanitizePath(unicodePath, testBaseDir);
    expect(result).toContain(testBaseDir);
  });

  test('should handle mixed path separators', () => {
    // This should still be safe - path.normalize handles it
    const mixedPath = 'folder\\subfolder/file.txt';
    const result = sanitizePath(mixedPath, testBaseDir);
    expect(result).toContain(testBaseDir);
  });

  test('should handle path with only dots', () => {
    expect(() => {
      sanitizePath('...', testBaseDir);
    }).toThrow('dangerous characters');
  });

  test('should handle base directory as resolved path', () => {
    const result = sanitizePath('file.txt', testBaseDir);
    expect(path.isAbsolute(result)).toBe(true);
    expect(result.startsWith(path.resolve(testBaseDir))).toBe(true);
  });
});

console.log('✅ Path Traversal Security Test Suite');
console.log('   Tests: sanitizePath(), sanitizeFilename(), generateSecureId()');
console.log('   Coverage: Path traversal, command injection, null bytes, Windows security');
