/**
 * Credential Encryption Utilities
 * AES-256-GCM encryption for securely storing credentials in the database
 */

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (keyHex && keyHex.length === 64) {
    return Buffer.from(keyHex, 'hex');
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY or SESSION_SECRET must be set');
  }

  return crypto.pbkdf2Sync(secret, 'gruenerator-credential-encryption', 100000, 32, 'sha256');
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
