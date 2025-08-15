# Database Security & Encryption Guide

## Overview
This guide explains how to secure your SQLite database and sensitive data when working with Git, LLMs, and local development.

## 🔒 Key Security Principles

### 1. **Never Commit Database Files to Git**
- SQLite database files contain ALL your user data
- Add to `.gitignore` immediately
- Use encrypted backups for sharing

### 2. **Separate Sensitive Data**
- Database files stay local
- Configuration uses environment variables
- Encryption keys never in code

## 📁 File Security Setup

### Step 1: Update .gitignore
```gitignore
# Database files - NEVER commit these!
*.db
*.sqlite
*.sqlite3
database/sqlite/*.db
database/backups/

# Environment files with secrets
.env
.env.local
.env.production

# Backup files
*.backup
*.bak

# Encryption keys
*.key
*.pem
encryption/
```

### Step 2: Create Secure Directory Structure
```
gruenerator_backend/
├── database/
│   ├── sqlite/
│   │   └── gruenerator.db      # ❌ NEVER commit
│   ├── backups/                 # ❌ NEVER commit
│   └── encryption/              # ❌ NEVER commit
│       ├── master.key
│       └── backup.key
```

## 🔐 Database Encryption Options

### Option 1: SQLite Encryption Extension (SEE)
**Cost:** €2000 one-time license
**Best for:** Commercial applications

### Option 2: SQLCipher (Recommended)
**Cost:** Free (open source)
**Installation:**
```bash
npm install @journeyapps/sqlcipher
```

### Option 3: Application-Level Encryption
**Cost:** Free
**Method:** Encrypt sensitive fields before storing

## 🛡️ Implementation: Field-Level Encryption

### Encryption Service
```javascript
// database/services/EncryptionService.js
import crypto from 'crypto';

class EncryptionService {
    constructor() {
        // Generate or load encryption key
        this.algorithm = 'aes-256-gcm';
        this.key = this.getOrCreateKey();
    }

    getOrCreateKey() {
        const keyPath = './database/encryption/master.key';
        
        if (fs.existsSync(keyPath)) {
            return fs.readFileSync(keyPath);
        }
        
        // Generate new key
        const key = crypto.randomBytes(32);
        fs.writeFileSync(keyPath, key);
        console.log('⚠️  New encryption key created. BACKUP THIS KEY!');
        return key;
    }

    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }

    decrypt(encryptedData) {
        const decipher = crypto.createDecipheriv(
            this.algorithm,
            this.key,
            Buffer.from(encryptedData.iv, 'hex')
        );
        
        decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
        
        let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }
}
```

## 🔑 Sensitive Fields to Encrypt

### Always Encrypt:
- `profiles.canva_access_token`
- `profiles.canva_refresh_token`
- `profiles.email` (optional)
- `profiles.custom_*_prompt` (contains personal data)
- `documents.ocr_text` (if contains sensitive info)
- `nextcloud_share_links`

### Example Usage:
```javascript
// When saving user data
const encryptedEmail = encryptionService.encrypt(email);
db.insert('profiles', {
    id: userId,
    email: JSON.stringify(encryptedEmail), // Store as JSON
    // ... other fields
});

// When reading user data
const user = db.queryOne('SELECT * FROM profiles WHERE id = ?', [userId]);
if (user.email) {
    user.email = encryptionService.decrypt(JSON.parse(user.email));
}
```

## 🚀 Quick Security Setup Script

```bash
#!/bin/bash
# setup-security.sh

# 1. Create secure directories
mkdir -p database/encryption
mkdir -p database/backups

# 2. Set restrictive permissions (Unix/Linux)
chmod 700 database/encryption
chmod 700 database/backups
chmod 600 database/sqlite/*.db

# 3. Generate encryption key
node -e "
const crypto = require('crypto');
const fs = require('fs');
const key = crypto.randomBytes(32);
fs.writeFileSync('./database/encryption/master.key', key);
console.log('Encryption key generated!');
console.log('⚠️  BACKUP THIS KEY TO A SECURE LOCATION!');
"

# 4. Create .env template
cat > .env.example << EOF
# Database Encryption
DB_ENCRYPTION_KEY=  # Copy from database/encryption/master.key
DB_BACKUP_PASSWORD= # For encrypted backups

# API Keys (if needed locally)
QDRANT_URL=http://localhost:6333
NEXTCLOUD_SHARE_LINK=

# Never commit the actual .env file!
EOF

echo "✅ Security setup complete!"
```

## 🔄 Backup & Restore

### Encrypted Backup Script
```javascript
// scripts/backup-encrypted.js
import { getSqliteInstance } from '../database/services/SqliteService.js';
import crypto from 'crypto';
import fs from 'fs';
import zlib from 'zlib';

async function createEncryptedBackup() {
    const db = getSqliteInstance();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `./database/backups/backup-${timestamp}.db`;
    
    // 1. Create backup
    db.backup(backupPath);
    
    // 2. Compress
    const data = fs.readFileSync(backupPath);
    const compressed = zlib.gzipSync(data);
    
    // 3. Encrypt
    const password = process.env.DB_BACKUP_PASSWORD || 'changeme';
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([
        cipher.update(compressed),
        cipher.final()
    ]);
    
    // 4. Save encrypted backup
    const encryptedPath = `${backupPath}.enc`;
    fs.writeFileSync(encryptedPath, Buffer.concat([
        salt,    // 16 bytes
        iv,      // 16 bytes
        encrypted
    ]));
    
    // 5. Delete unencrypted backup
    fs.unlinkSync(backupPath);
    
    console.log(`✅ Encrypted backup created: ${encryptedPath}`);
    return encryptedPath;
}
```

## 🤖 Working with LLMs (Claude, etc.)

### Safe Practices:

1. **Never share database files directly**
2. **Create sanitized exports:**

```javascript
// scripts/export-for-llm.js
function exportSanitizedData() {
    const db = getSqliteInstance();
    
    // Export structure only, no data
    const schema = db.query(`
        SELECT sql FROM sqlite_master 
        WHERE type='table'
    `);
    
    // Export sample data with PII removed
    const sampleUsers = db.query(`
        SELECT 
            'user_' || substr(id, 1, 8) as id,
            'User ' || rowid as display_name,
            'user' || rowid || '@example.com' as email,
            created_at
        FROM profiles 
        LIMIT 5
    `);
    
    return {
        schema,
        samples: {
            profiles: sampleUsers
            // Add other sanitized samples
        }
    };
}
```

## 🔍 Environment Variables

### Required .env file:
```env
# Database
DB_ENCRYPTION_KEY=<32-byte-hex-key>
DB_BACKUP_PASSWORD=<strong-password>

# Services
QDRANT_URL=http://localhost:6333
NEXTCLOUD_SHARE_LINK=<your-nextcloud-share>

# Never include actual user data!
```

## ⚠️ Security Checklist

- [ ] Added `*.db` to `.gitignore`
- [ ] Created encryption key
- [ ] Backed up encryption key securely
- [ ] Set file permissions (chmod 600)
- [ ] Encrypted sensitive fields
- [ ] Created backup strategy
- [ ] Documented recovery procedure
- [ ] Tested restore process

## 🚨 Emergency Procedures

### If Database Exposed:
1. Immediately rotate all tokens
2. Reset all user passwords via Keycloak
3. Generate new encryption keys
4. Notify affected users
5. Audit access logs

### If Encryption Key Lost:
1. Restore from encrypted backup
2. Use backup encryption key
3. Re-encrypt with new key
4. Update all applications

## 📚 Additional Security Measures

### 1. Row-Level Security
```javascript
// Always filter by user_id
const documents = db.query(
    'SELECT * FROM documents WHERE user_id = ?',
    [authenticatedUserId]
);
```

### 2. Input Validation
```javascript
// Prevent SQL injection
const safeQuery = db.prepare('SELECT * FROM users WHERE id = ?');
safeQuery.get(userId); // Parameterized query
```

### 3. Audit Logging
```javascript
// Log all sensitive operations
function logAccess(userId, action, resource) {
    db.insert('audit_log', {
        user_id: userId,
        action: action,
        resource: resource,
        timestamp: new Date().toISOString(),
        ip_address: req.ip
    });
}
```

## 🔧 Monitoring

### Database Health Check
```javascript
// Regular integrity checks
function checkDatabaseIntegrity() {
    const result = db.query('PRAGMA integrity_check');
    if (result[0].integrity_check !== 'ok') {
        console.error('Database corruption detected!');
        // Trigger restore from backup
    }
}
```

## 📖 Best Practices Summary

1. **Never commit sensitive data to Git**
2. **Encrypt PII and tokens at rest**
3. **Use environment variables for secrets**
4. **Implement field-level encryption**
5. **Create encrypted backups regularly**
6. **Sanitize data before sharing**
7. **Monitor and audit access**
8. **Test recovery procedures**

---

Remember: **Security is not optional!** Follow these practices to protect your users' data.