import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Encryption Service for sensitive data
 * Uses AES-256-GCM for authenticated encryption
 */
class EncryptionService {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.keyPath = path.join(__dirname, '../encryption/master.key');
        this.backupKeyPath = path.join(__dirname, '../encryption/backup.key');
        this.key = null;
        this.isInitialized = false;
        this.init();
    }

    /**
     * Initialize encryption service
     */
    init() {
        try {
            // Ensure encryption directory exists
            const encDir = path.dirname(this.keyPath);
            if (!fs.existsSync(encDir)) {
                fs.mkdirSync(encDir, { recursive: true, mode: 0o700 });
                console.log('[EncryptionService] Created encryption directory with restricted permissions');
            }

            // Load or create encryption key
            this.key = this.getOrCreateKey();
            this.isInitialized = true;
            
            console.log('[EncryptionService] Encryption service initialized');
            
            // Create backup key if it doesn't exist
            this.createBackupKey();
            
        } catch (error) {
            console.error('[EncryptionService] Failed to initialize:', error);
            throw new Error(`Encryption initialization failed: ${error.message}`);
        }
    }

    /**
     * Get existing key or create new one
     */
    getOrCreateKey() {
        if (fs.existsSync(this.keyPath)) {
            console.log('[EncryptionService] Loading existing encryption key');
            const key = fs.readFileSync(this.keyPath);
            
            // Validate key length
            if (key.length !== 32) {
                throw new Error('Invalid encryption key length. Expected 32 bytes.');
            }
            
            return key;
        }

        // Generate new key
        console.log('[EncryptionService] Generating new encryption key');
        const key = crypto.randomBytes(32);
        
        // Save with restricted permissions
        fs.writeFileSync(this.keyPath, key, { mode: 0o600 });
        
        console.warn('');
        console.warn('═══════════════════════════════════════════════════════════════');
        console.warn('⚠️  NEW ENCRYPTION KEY CREATED!');
        console.warn('⚠️  BACKUP THIS KEY IMMEDIATELY TO A SECURE LOCATION!');
        console.warn('⚠️  Path:', this.keyPath);
        console.warn('⚠️  Without this key, encrypted data CANNOT be recovered!');
        console.warn('═══════════════════════════════════════════════════════════════');
        console.warn('');
        
        return key;
    }

    /**
     * Create backup key for recovery
     */
    createBackupKey() {
        if (!fs.existsSync(this.backupKeyPath) && this.key) {
            // Create encrypted backup of the master key
            const backupPassword = process.env.DB_BACKUP_PASSWORD || 'CHANGE_THIS_PASSWORD';
            
            if (backupPassword === 'CHANGE_THIS_PASSWORD') {
                console.warn('[EncryptionService] ⚠️  Using default backup password. Set DB_BACKUP_PASSWORD in .env!');
            }
            
            const salt = crypto.randomBytes(16);
            const derivedKey = crypto.pbkdf2Sync(backupPassword, salt, 100000, 32, 'sha256');
            const iv = crypto.randomBytes(16);
            
            const cipher = crypto.createCipheriv('aes-256-cbc', derivedKey, iv);
            const encryptedKey = Buffer.concat([
                cipher.update(this.key),
                cipher.final()
            ]);
            
            // Save backup key with metadata
            const backup = {
                salt: salt.toString('hex'),
                iv: iv.toString('hex'),
                encryptedKey: encryptedKey.toString('hex'),
                created: new Date().toISOString(),
                hint: 'Use DB_BACKUP_PASSWORD to decrypt'
            };
            
            fs.writeFileSync(this.backupKeyPath, JSON.stringify(backup, null, 2), { mode: 0o600 });
            console.log('[EncryptionService] Backup key created');
        }
    }

    /**
     * Encrypt text data
     */
    encrypt(text) {
        if (!this.isInitialized) {
            throw new Error('Encryption service not initialized');
        }

        if (!text) return null;
        
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
            
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            // Return as JSON string for easy storage
            return JSON.stringify({
                e: encrypted,           // encrypted data
                i: iv.toString('hex'),  // initialization vector
                a: authTag.toString('hex') // authentication tag
            });
        } catch (error) {
            console.error('[EncryptionService] Encryption failed:', error);
            throw new Error('Encryption failed');
        }
    }

    /**
     * Decrypt text data
     */
    decrypt(encryptedData) {
        if (!this.isInitialized) {
            throw new Error('Encryption service not initialized');
        }

        if (!encryptedData) return null;
        
        try {
            // Parse encrypted data
            const data = typeof encryptedData === 'string' 
                ? JSON.parse(encryptedData) 
                : encryptedData;
            
            const decipher = crypto.createDecipheriv(
                this.algorithm,
                this.key,
                Buffer.from(data.i, 'hex')
            );
            
            decipher.setAuthTag(Buffer.from(data.a, 'hex'));
            
            let decrypted = decipher.update(data.e, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('[EncryptionService] Decryption failed:', error);
            throw new Error('Decryption failed - data may be corrupted or key mismatch');
        }
    }

    /**
     * Encrypt an object (converts to JSON first)
     */
    encryptObject(obj) {
        if (!obj) return null;
        return this.encrypt(JSON.stringify(obj));
    }

    /**
     * Decrypt an object (parses JSON after decryption)
     */
    decryptObject(encryptedData) {
        const decrypted = this.decrypt(encryptedData);
        if (!decrypted) return null;
        
        try {
            return JSON.parse(decrypted);
        } catch (error) {
            console.error('[EncryptionService] Failed to parse decrypted object:', error);
            return decrypted; // Return as string if not valid JSON
        }
    }

    /**
     * Hash a password or sensitive data (one-way)
     */
    hash(data) {
        return crypto
            .createHash('sha256')
            .update(data)
            .digest('hex');
    }

    /**
     * Generate a secure random token
     */
    generateToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Encrypt sensitive fields in an object
     */
    encryptFields(obj, fieldsToEncrypt) {
        const encrypted = { ...obj };
        
        for (const field of fieldsToEncrypt) {
            if (encrypted[field] !== undefined && encrypted[field] !== null) {
                encrypted[field] = this.encrypt(encrypted[field]);
            }
        }
        
        return encrypted;
    }

    /**
     * Decrypt sensitive fields in an object
     */
    decryptFields(obj, fieldsToDecrypt) {
        const decrypted = { ...obj };
        
        for (const field of fieldsToDecrypt) {
            if (decrypted[field]) {
                try {
                    decrypted[field] = this.decrypt(decrypted[field]);
                } catch (error) {
                    console.warn(`[EncryptionService] Failed to decrypt field ${field}:`, error.message);
                    // Leave field as is if decryption fails
                }
            }
        }
        
        return decrypted;
    }

    /**
     * Get encryption status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            keyExists: fs.existsSync(this.keyPath),
            backupKeyExists: fs.existsSync(this.backupKeyPath),
            algorithm: this.algorithm,
            keyPath: this.keyPath
        };
    }

    /**
     * Rotate encryption key (requires re-encrypting all data)
     */
    async rotateKey(reEncryptCallback) {
        console.log('[EncryptionService] Starting key rotation...');
        
        // Backup old key
        const oldKey = this.key;
        const backupPath = `${this.keyPath}.${Date.now()}.backup`;
        fs.writeFileSync(backupPath, oldKey, { mode: 0o600 });
        
        // Generate new key
        const newKey = crypto.randomBytes(32);
        fs.writeFileSync(this.keyPath, newKey, { mode: 0o600 });
        
        // Update in memory
        const tempKey = this.key;
        this.key = newKey;
        
        try {
            // Call the re-encryption callback
            if (reEncryptCallback) {
                await reEncryptCallback(
                    (data) => this.decryptWithKey(data, oldKey),
                    (data) => this.encrypt(data)
                );
            }
            
            console.log('[EncryptionService] Key rotation completed successfully');
            console.log('[EncryptionService] Old key backed up to:', backupPath);
            
            // Create new backup key
            this.createBackupKey();
            
        } catch (error) {
            // Restore old key on failure
            this.key = tempKey;
            fs.writeFileSync(this.keyPath, tempKey, { mode: 0o600 });
            
            console.error('[EncryptionService] Key rotation failed, restored old key:', error);
            throw error;
        }
    }

    /**
     * Decrypt with a specific key (used during key rotation)
     */
    decryptWithKey(encryptedData, key) {
        if (!encryptedData) return null;
        
        try {
            const data = typeof encryptedData === 'string' 
                ? JSON.parse(encryptedData) 
                : encryptedData;
            
            const decipher = crypto.createDecipheriv(
                this.algorithm,
                key,
                Buffer.from(data.i, 'hex')
            );
            
            decipher.setAuthTag(Buffer.from(data.a, 'hex'));
            
            let decrypted = decipher.update(data.e, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error(`Decryption with key failed: ${error.message}`);
        }
    }
}

// Sensitive fields configuration - only tokens, API keys, and share links
export const SENSITIVE_FIELDS = {
    profiles: [
        'canva_access_token',      // OAuth token - KEEP ENCRYPTED
        'canva_refresh_token',     // OAuth token - KEEP ENCRYPTED  
        'nextcloud_share_links'    // Share links - KEEP ENCRYPTED
    ],
    documents: [],  // Remove all - no sensitive data
    custom_generators: [],  // Remove prompt_template - not sensitive
    memories: [],  // Remove memory_content - not sensitive
    qa_public_access: [
        'access_token'  // API token - ADD THIS
    ]
};

// Define which fields should use object encryption (JSON/arrays) vs string encryption
export const OBJECT_ENCRYPTED_FIELDS = {
    profiles: [
        'nextcloud_share_links'  // Array of share link objects
    ],
    documents: [],  // Remove metadata - no longer encrypted
    custom_generators: [],  // No fields encrypted
    memories: [],  // No fields encrypted
    qa_public_access: []  // access_token is string, not object
};

// Export singleton instance
let encryptionInstance = null;

export function getEncryptionService() {
    if (!encryptionInstance) {
        encryptionInstance = new EncryptionService();
    }
    return encryptionInstance;
}

export { EncryptionService };
export default EncryptionService;