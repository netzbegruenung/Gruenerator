# Quick Start - Deploying Grünerator Docs to Coolify

This guide will get your docs app running on Coolify in under 10 minutes.

## Prerequisites Checklist

- [ ] Coolify instance running
- [ ] PostgreSQL database (same as main Grünerator API)
- [ ] Redis instance (same as main Grünerator API)
- [ ] Domain `docs.gruenerator.de` DNS configured
- [ ] Git repository access configured in Coolify

## Step 1: Prepare Environment Variables (2 minutes)

Copy these and prepare your values:

```env
# === REQUIRED ===
NODE_ENV=production
PORT=3000
HOCUSPOCUS_PORT=1240

# Database (same as your main API)
POSTGRES_HOST=your-postgres-host
POSTGRES_PORT=5432
POSTGRES_DB=gruenerator
POSTGRES_USER=your-user
POSTGRES_PASSWORD=your-password

# Frontend URLs
VITE_API_BASE_URL=https://api.gruenerator.de
VITE_HOCUSPOCUS_URL=wss://docs.gruenerator.de:1240

# === OPTIONAL ===
LOG_LEVEL=info
LOG_FORMAT=json
```

## Step 2: Create Database Tables (1 minute)

Connect to your PostgreSQL and run:

```bash
psql -h your-postgres-host -U postgres -d gruenerator
```

```sql
CREATE TABLE IF NOT EXISTS collaborative_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'document',
  document_subtype TEXT NOT NULL DEFAULT 'docs',
  content_preview TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  is_public BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  permissions JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS yjs_document_updates (
  id SERIAL PRIMARY KEY,
  document_id TEXT NOT NULL,
  update_data BYTEA NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_yjs_updates_document
  ON yjs_document_updates(document_id, created_at);

CREATE TABLE IF NOT EXISTS yjs_document_snapshots (
  id SERIAL PRIMARY KEY,
  document_id TEXT NOT NULL,
  snapshot_data BYTEA NOT NULL,
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  is_auto_save BOOLEAN DEFAULT true,
  label TEXT,
  created_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_yjs_snapshots_document
  ON yjs_document_snapshots(document_id, version DESC);
```

## Step 3: Deploy to Coolify (5 minutes)

### 3.1 Create Service

1. Log into Coolify
2. Go to your project
3. Click **"Add New Resource"** → **"Docker Compose"**

### 3.2 Configure Service

**Repository Settings:**
- Repository: `your-gruenerator-repo-url`
- Branch: `main`
- Base Directory: `apps/docs`
- Compose File: `docker-compose.yml`

**Build Settings:**
- Leave as default (uses Dockerfile)

### 3.3 Set Environment Variables

Click **"Environment Variables"** and paste the values from Step 1.

### 3.4 Configure Domain

1. Click **"Domains"**
2. Add domain: `docs.gruenerator.de`
3. Enable **HTTPS** (Let's Encrypt)
4. Enable **WebSocket** support

### 3.5 Configure Ports

1. Click **"Ports"**
2. Expose ports:
   - `3000` (HTTP)
   - `1240` (WebSocket)

### 3.6 Deploy

1. Click **"Deploy"**
2. Watch build logs
3. Wait for "Deployment successful"

## Step 4: Verify (2 minutes)

### 4.1 Health Check

```bash
curl https://docs.gruenerator.de/health
```

Expected:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-10T...",
  "service": "gruenerator-docs"
}
```

### 4.2 Test WebSocket

Open browser console at `https://docs.gruenerator.de`:

```javascript
const ws = new WebSocket('wss://docs.gruenerator.de:1240');
ws.onopen = () => console.log('✓ WebSocket connected!');
ws.onerror = (err) => console.error('✗ WebSocket error:', err);
```

### 4.3 Test Authentication

1. Visit `https://docs.gruenerator.de`
2. Should redirect to login (Keycloak)
3. After login, should show document list
4. Create a test document
5. Open in another browser tab
6. Verify real-time collaboration works

## Step 5: Configure Reverse Proxy (if needed)

If WebSocket fails, you may need to configure your reverse proxy.

### Option A: Direct Port (Easiest)

Use port 1240 directly:
```env
VITE_HOCUSPOCUS_URL=wss://docs.gruenerator.de:1240
```

### Option B: Proxy WebSocket (Recommended for production)

**Nginx:**
```nginx
location /ws {
    proxy_pass http://localhost:1240;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

Then use:
```env
VITE_HOCUSPOCUS_URL=wss://docs.gruenerator.de/ws
```

**Caddy:**
```caddyfile
docs.gruenerator.de {
    @websocket {
        path /ws
        header Connection *Upgrade*
        header Upgrade websocket
    }
    handle @websocket {
        reverse_proxy localhost:1240
    }
}
```

## Troubleshooting

### Build Fails

**Error**: "Cannot find module '@gruenerator/shared'"
**Fix**: Ensure build context is monorepo root (handled by Dockerfile)

**Error**: "pnpm: command not found"
**Fix**: Dockerfile should install pnpm (already handled)

### Health Check Fails

**Error**: 404 Not Found
**Fix**:
1. Check logs: `docker logs gruenerator-docs`
2. Verify build completed successfully
3. Check if server started on port 3000

### WebSocket Fails

**Error**: "WebSocket connection failed"
**Fix**:
1. Check port 1240 is accessible
2. Verify firewall allows port 1240
3. Check `VITE_HOCUSPOCUS_URL` is correct
4. Try direct port instead of proxy

### Authentication Fails

**Error**: "Session not found"
**Fix**:
1. Verify Redis is accessible from container
2. Check session cookie domain
3. Ensure same Redis as main API

## Next Steps

- [ ] Set up monitoring (Coolify built-in)
- [ ] Configure automated backups
- [ ] Set up log aggregation (optional)
- [ ] Configure auto-deploy on push
- [ ] Set up staging environment

## Need Help?

- Coolify docs: https://coolify.io/docs
- Check [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed guide
- Check [README.md](./README.md) for architecture details
- Review logs: Coolify dashboard → Your service → Logs

## Success!

Your Grünerator Docs is now live at `https://docs.gruenerator.de`! 🎉

Users can:
- Create collaborative documents
- Edit in real-time with others
- View version history
- Share documents with permissions
