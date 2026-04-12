import * as crypto from 'crypto';

import { env } from '../../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

let _cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (_cachedKey) return _cachedKey;

  const keyHex = env.CREDENTIAL_ENCRYPTION_KEY;
  if (keyHex && keyHex.length === 64) {
    _cachedKey = Buffer.from(keyHex, 'hex');
    return _cachedKey;
  }

  const secret = env.SESSION_SECRET;
  if (!secret) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY or SESSION_SECRET must be set');
  }

  // PBKDF2 with 100k iterations is CPU-intensive — cache the result
  _cachedKey = crypto.pbkdf2Sync(secret, 'gruenerator-credential-encryption', 100000, 32, 'sha256');
  return _cachedKey;
}

export function encryptCredential(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const payload = JSON.stringify({
    iv: iv.toString('hex'),
    tag: authTag.toString('hex'),
    ct: encrypted.toString('hex'),
  });

  return Buffer.from(payload).toString('base64');
}

export function decryptCredential(encrypted: string): string {
  const key = getEncryptionKey();
  const payload = JSON.parse(Buffer.from(encrypted, 'base64').toString('utf8')) as {
    iv: string;
    tag: string;
    ct: string;
  };

  const iv = Buffer.from(payload.iv, 'hex');
  const authTag = Buffer.from(payload.tag, 'hex');
  const ciphertext = Buffer.from(payload.ct, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export default {
  encryptCredential,
  decryptCredential,
};
