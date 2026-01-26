# Grünerator Docs - Collaborative Documentation Platform

A real-time collaborative documentation editor powered by TipTap and Y.js, designed for the Grünerator ecosystem.

## Features

- **Real-time Collaboration**: Multiple users can edit documents simultaneously
- **Rich Text Editing**: Full-featured TipTap editor with formatting, lists, images, and more
- **Version History**: Automatic snapshots and version tracking
- **Authentication**: Integrated with Grünerator's Keycloak authentication
- **Document Permissions**: Owner/editor/viewer access levels
- **WebSocket Sync**: Low-latency document synchronization via Hocuspocus

## Architecture

### Frontend

- **Framework**: React 18 + Vite
- **Editor**: TipTap (extensible rich text editor)
- **Collaboration**: Y.js CRDT for conflict-free collaborative editing
- **State Management**: Zustand for global state, React Query for server state
- **Styling**: SCSS modules with responsive design

### Backend

- **WebSocket Server**: Hocuspocus (Y.js WebSocket provider)
- **Persistence**: PostgreSQL for document storage
- **Authentication**: Session-based auth via Redis + Keycloak
- **Document Storage**: Compressed Y.js snapshots and incremental updates

## Development

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL database (shared with main Grünerator API)
- Redis (shared with main Grünerator API)

### Setup

1. Install dependencies:

```bash
cd apps/docs
pnpm install
```

2. Configure environment:

```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start development server:

```bash
pnpm dev
```

This will start:

- Vite dev server on `http://localhost:3000`
- Hot module reloading for frontend
- API proxying to the backend

### Building for Production

```bash
pnpm build
```

This creates an optimized production build in `dist/`.

## Deployment

### Docker Deployment (Recommended)

#### Build Docker Image

```bash
# From the docs directory
docker build -t gruenerator-docs -f Dockerfile ../..
```

#### Run with Docker Compose

```bash
# Configure environment variables in .env.production
cp .env.production.example .env.production
# Edit .env.production

# Start the service
docker compose up -d
```

The service will be available at:

- Frontend: `http://localhost:3000`
- WebSocket: `ws://localhost:1240`

### Coolify Deployment

1. **Create New Service** in Coolify:
   - Type: Docker Compose
   - Repository: Your Grünerator monorepo
   - Base Directory: `apps/docs`
   - Compose File: `docker-compose.yml`

2. **Configure Environment Variables**:

   ```env
   NODE_ENV=production
   PORT=3000
   HOCUSPOCUS_PORT=1240

   # Database (use existing Grünerator PostgreSQL)
   POSTGRES_HOST=your-postgres-host
   POSTGRES_PORT=5432
   POSTGRES_DB=gruenerator
   POSTGRES_USER=gruenerator_user
   POSTGRES_PASSWORD=your_secure_password

   # Frontend WebSocket URL
   VITE_HOCUSPOCUS_URL=wss://docs.gruenerator.de:1240
   # OR if behind reverse proxy:
   # VITE_HOCUSPOCUS_URL=wss://docs.gruenerator.de/ws

   # API URL
   VITE_API_BASE_URL=https://api.gruenerator.de
   ```

3. **Configure Reverse Proxy** (Nginx/Caddy):
   - Port 3000: HTTP traffic (frontend)
   - Port 1240: WebSocket traffic (Hocuspocus)

   Example Nginx config:

   ```nginx
   # HTTP traffic
   location / {
     proxy_pass http://localhost:3000;
     proxy_set_header Host $host;
     proxy_set_header X-Real-IP $remote_addr;
     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
     proxy_set_header X-Forwarded-Proto $scheme;
   }

   # WebSocket traffic
   location /ws {
     proxy_pass http://localhost:1240;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
     proxy_set_header Host $host;
     proxy_set_header X-Real-IP $remote_addr;
     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
     proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

4. **Deploy**:
   - Push to your repository
   - Coolify will automatically build and deploy
   - Check health endpoint: `https://docs.gruenerator.de/health`

### Manual Deployment

1. Build the frontend:

```bash
pnpm build
```

2. Start the production server:

```bash
pnpm start:prod
```

The server will:

- Serve static files from `dist/`
- Run Hocuspocus WebSocket server
- Handle SPA routing

## Database Setup

The docs app uses the same PostgreSQL database as the main Grünerator API. Ensure these tables exist:

```sql
-- Collaborative documents
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

CREATE INDEX IF NOT EXISTS idx_yjs_updates_document ON yjs_document_updates(document_id, created_at);
CREATE INDEX IF NOT EXISTS idx_yjs_snapshots_document ON yjs_document_snapshots(document_id, version DESC);
```

## Environment Variables

### Required

| Variable              | Description                | Example                          |
| --------------------- | -------------------------- | -------------------------------- |
| `NODE_ENV`            | Environment                | `production`                     |
| `PORT`                | HTTP server port           | `3000`                           |
| `HOCUSPOCUS_PORT`     | WebSocket server port      | `1240`                           |
| `POSTGRES_HOST`       | PostgreSQL host            | `postgres.example.com`           |
| `POSTGRES_DB`         | Database name              | `gruenerator`                    |
| `POSTGRES_USER`       | Database user              | `gruenerator_user`               |
| `POSTGRES_PASSWORD`   | Database password          | `secure_password`                |
| `VITE_HOCUSPOCUS_URL` | WebSocket URL for frontend | `wss://docs.gruenerator.de:1240` |

### Optional

| Variable          | Description            | Default   |
| ----------------- | ---------------------- | --------- |
| `HOCUSPOCUS_HOST` | WebSocket bind address | `0.0.0.0` |
| `POSTGRES_PORT`   | PostgreSQL port        | `5432`    |
| `LOG_LEVEL`       | Logging level          | `info`    |
| `LOG_FORMAT`      | Log format             | `json`    |

## Monitoring

### Health Check

The server provides a health endpoint:

```bash
curl https://docs.gruenerator.de/health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": "2026-01-10T12:00:00.000Z",
  "service": "gruenerator-docs"
}
```

### Logs

Logs are written to stdout in JSON format (configurable via `LOG_FORMAT`).

View logs in Docker:

```bash
docker compose logs -f docs
```

## Troubleshooting

### WebSocket Connection Fails

1. Check WebSocket URL configuration:

   ```env
   VITE_HOCUSPOCUS_URL=wss://docs.gruenerator.de:1240
   ```

2. Ensure reverse proxy allows WebSocket upgrades:

   ```nginx
   proxy_http_version 1.1;
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   ```

3. Check firewall allows port 1240

### Authentication Fails

1. Verify Redis connection (shared with main API)
2. Check session cookie domain matches
3. Ensure PostgreSQL `profiles` table is accessible

### Document Not Loading

1. Check PostgreSQL connection
2. Verify tables exist (see Database Setup)
3. Check logs for persistence errors

## License

Part of the Grünerator project.
