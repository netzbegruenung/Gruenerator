import crypto from 'crypto';

/**
 * scrypt password hashes as `"salt:hash"` (hex). The salt string itself (not its
 * decoded bytes) is the scrypt salt — the format `shared_media.password_hash`
 * has always used, so existing rows keep verifying.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, storedHash] = stored.split(':');
  if (!salt || !storedHash) return false;
  const expected = Buffer.from(storedHash, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  return expected.length === derived.length && crypto.timingSafeEqual(derived, expected);
}
