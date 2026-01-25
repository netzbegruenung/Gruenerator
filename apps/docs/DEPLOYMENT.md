# Deployment Guide for Grünerator Docs

## Quick Start with Coolify

### 1. Prerequisites

Ensure you have:

- Coolify instance running
- Access to the same PostgreSQL and Redis as the main Grünerator API
- Domain `docs.gruenerator.de` pointing to your Coolify server

### 2. Create Service in Coolify

1. **New Service**:
   - Go to your Coolify project
   - Click "Add New Resource" → "Docker Compose"

2. **Configure Repository**:
   - Repository: Your Grünerator monorepo URL
   - Branch: `main` (or your deployment branch)
   - Base Directory: `apps/docs`
   - Compose File: `docker-compose.yml`

3. **Set Environment Variables**:

   Click "Environment Variables" and add:

   ```env
   # Required
   NODE_ENV=production
   PORT=3000
   HOCUSPOCUS_PORT=1240

   # Database (same as main API)
   POSTGRES_HOST=your-postgres-host.internal
   POSTGRES_PORT=5432
   POSTGRES_DB=gruenerator
   POSTGRES_USER=gruenerator_user
   POSTGRES_PASSWORD=your_secure_password_here

   # Frontend Configuration
   VITE_API_BASE_URL=https://api.gruenerator.de
   VITE_API_TARGET=https://api.gruenerator.de
   VITE_HOCUSPOCUS_URL=wss://docs.gruenerator.de:1240

   # Optional
   LOG_LEVEL=info
   LOG_FORMAT=json
   ```

4. **Configure Domains**:
   - Primary domain: `docs.gruenerator.de`
   - Enable HTTPS (Let's Encrypt)
   - Enable WebSocket support

5. **Configure Ports**:
   - Port 3000: HTTP traffic (main app)
   - Port 1240: WebSocket traffic (collaboration)

6. **Deploy**:
   - Click "Deploy"
   - Monitor build logs
   - Wait for health check to pass

### 3. Verify Deployment

Check the health endpoint:

```bash
curl https://docs.gruenerator.de/health
```

Expected response:

```json
{
  "status": "healthy",
  "timestamp": "2026-01-10T12:00:00.000Z",
  "service": "gruenerator-docs"
}
```

Test WebSocket connection:

```bash
# In browser console at https://docs.gruenerator.de
const ws = new WebSocket('wss://docs.gruenerator.de:1240');
ws.onopen = () => console.log('Connected!');
ws.onerror = (err) => console.error('Error:', err);
```

## Nginx Configuration (if using reverse proxy)

If you're using Nginx in front of Coolify:

```nginx
# /etc/nginx/sites-available/docs.gruenerator.de

upstream docs_http {
    server 127.0.0.1:3000;
}

upstream docs_ws {
    server 127.0.0.1:1240;
}

server {
    listen 80;
    listen [::]:80;
    server_name docs.gruenerator.de;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name docs.gruenerator.de;

    # SSL Configuration (use Coolify's or Let's Encrypt)
    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # WebSocket endpoint
    location /ws {
        proxy_pass http://docs_ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeout
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # HTTP traffic (frontend)
    location / {
        proxy_pass http://docs_http;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SPA routing support
        try_files $uri $uri/ /index.html;
    }

    # Health check
    location /health {
        proxy_pass http://docs_http;
        access_log off;
    }
}
```

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/docs.gruenerator.de /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Caddy Configuration (Alternative)

If using Caddy:

```caddyfile
# /etc/caddy/Caddyfile

docs.gruenerator.de {
    # HTTP traffic
    reverse_proxy localhost:3000

    # WebSocket upgrade
    @websocket {
        path /ws
        header Connection *Upgrade*
        header Upgrade websocket
    }
    handle @websocket {
        reverse_proxy localhost:1240
    }

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
    }
}
```

Reload Caddy:

```bash
sudo systemctl reload caddy
```

## Database Setup

The docs app shares the PostgreSQL database with the main API. Ensure these tables exist:

```bash
# Connect to your PostgreSQL instance
psql -h your-postgres-host -U postgres -d gruenerator

# Run this SQL
```

```sql
-- Collaborative documents table
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

-- Y.js incremental updates
CREATE TABLE IF NOT EXISTS yjs_document_updates (
  id SERIAL PRIMARY KEY,
  document_id TEXT NOT NULL,
  update_data BYTEA NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_yjs_updates_document
  ON yjs_document_updates(document_id, created_at);

-- Y.js snapshots for fast loading
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

## Monitoring and Logs

### View Logs in Coolify

1. Go to your service in Coolify
2. Click "Logs" tab
3. Monitor real-time logs

### View Logs with Docker

```bash
# SSH into your server
ssh your-server

# View logs
docker compose -f /path/to/coolify/apps/docs/docker-compose.yml logs -f docs

# Filter by level
docker compose logs -f docs | grep ERROR
```

### Set Up Log Aggregation (Optional)

Send logs to external service:

```env
# Add to environment variables
LOG_DRIVER=syslog
LOG_SYSLOG_ADDRESS=udp://your-log-server:514
```

## Scaling Considerations

### Single Instance (Current Setup)

- Suitable for <100 concurrent users
- Single WebSocket server handles all connections
- PostgreSQL handles document persistence

### Multi-Instance (Future)

For higher load, consider:

1. **Load Balancer**: Distribute HTTP traffic
2. **WebSocket Sticky Sessions**: Ensure users stick to same Hocuspocus instance
3. **Y.js Pub/Sub**: Use Redis pub/sub for cross-instance sync
4. **Horizontal Scaling**: Run multiple docs containers

## Backup and Recovery

### Database Backups

Ensure your PostgreSQL backup includes:

- `collaborative_documents` table
- `yjs_document_updates` table
- `yjs_document_snapshots` table

### Restore Procedure

1. Restore PostgreSQL backup
2. Restart docs service
3. Documents will load from database

## Security Checklist

- [ ] HTTPS enabled (TLS 1.2+)
- [ ] WebSocket uses WSS (secure WebSocket)
- [ ] PostgreSQL connection uses SSL
- [ ] Redis connection uses TLS (if external)
- [ ] Session cookies are secure and httpOnly
- [ ] CORS configured correctly
- [ ] CSP headers configured
- [ ] Rate limiting enabled on reverse proxy
- [ ] Regular security updates applied

## Troubleshooting

### Build Fails

```bash
# Check Coolify build logs
# Common issues:
# 1. pnpm version mismatch
# 2. Missing dependencies
# 3. Build context incorrect

# Try local build
cd apps/docs
docker build -t test-docs -f Dockerfile ../..
```

### Health Check Fails

```bash
# SSH into container
docker exec -it gruenerator-docs sh

# Test health endpoint
wget -O- http://localhost:3000/health

# Check if server is running
ps aux | grep node
```

### WebSocket Connection Fails

```bash
# Check if port is open
telnet docs.gruenerator.de 1240

# Check reverse proxy config
sudo nginx -t
sudo journalctl -u nginx -f

# Check Hocuspocus logs
docker logs gruenerator-docs 2>&1 | grep Hocuspocus
```

### Authentication Fails

1. Verify Redis connection:

   ```bash
   # From docs container
   redis-cli -h your-redis-host ping
   ```

2. Check session cookie:

   ```javascript
   // In browser console
   document.cookie;
   ```

3. Verify PostgreSQL connection:
   ```bash
   # From docs container
   psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT 1"
   ```

## Support

For issues:

1. Check logs in Coolify
2. Review [README.md](./README.md)
3. Check [main Grünerator docs](../../docs/)
4. Open issue on GitHub
