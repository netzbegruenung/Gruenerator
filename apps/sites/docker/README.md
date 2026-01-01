# Gruenerator Sites - Docker Deployment

Self-hosted Docker deployment for the Gruenerator Sites app. Optimized for **Coolify** but also works with standard Docker.

## Coolify Deployment

### 1. Add New Resource in Coolify

1. Go to your Coolify dashboard
2. Click **+ Add Resource** → **Docker**
3. Select **Dockerfile** as build pack
4. Connect your Git repository

### 2. Configure Build Settings

| Setting | Value |
|---------|-------|
| **Dockerfile Location** | `apps/sites/docker/Dockerfile` |
| **Build Context** | `/` (repository root) |
| **Port** | `3000` |

### 3. Add Environment Variables

In Coolify's **Environment Variables** section:

```
API_BASE_URL=https://your-api.gruenerator.de
```

| Variable | Required | Description |
|----------|----------|-------------|
| `API_BASE_URL` | **Yes** | URL of your Gruenerator API backend |
| `PORT` | No | Coolify sets this automatically (default: 3000) |

### 4. Deploy

Click **Deploy** - Coolify handles the rest!

---

## Local Development (Docker Compose)

For local testing before deploying to Coolify:

```bash
cd apps/sites/docker

# Configure
cp .env.example .env
# Edit .env with your API_BASE_URL

# Build and run
docker-compose up --build

# Access at http://localhost:3000
```

---

## Architecture

```
┌─────────────────────────┐      ┌─────────────────────────────┐
│  Coolify Container      │      │   External Services         │
│  ┌───────────────────┐  │      │                             │
│  │      Nginx        │──┼──────┼──► API Backend              │
│  │   (Sites SPA)     │  │      │   (your-api.example.com)    │
│  │   Port: 3000      │  │      │                             │
│  └───────────────────┘  │      │   Keycloak (Auth)           │
└─────────────────────────┘      └─────────────────────────────┘
```

**Container includes:**
- Nginx serving the React SPA
- Reverse proxy for `/api/*` and `/auth/*` routes
- Health check at `/health`

**External (not in container):**
- Your existing Gruenerator API
- Keycloak authentication
- PostgreSQL database

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_BASE_URL` | `http://localhost:3001` | Your Gruenerator API URL |
| `PORT` | `3000` | Port nginx listens on (Coolify sets this) |

---

## Health Check

Coolify uses the built-in health check:

```bash
curl http://your-sites-url/health
# Returns: OK
```

---

## Troubleshooting

### Build fails in Coolify

1. Ensure **Build Context** is set to `/` (repo root)
2. Verify **Dockerfile Location** is `apps/sites/docker/Dockerfile`
3. Check Coolify build logs for npm errors

### API requests fail (502/504)

1. Verify `API_BASE_URL` is correct and reachable from Coolify's network
2. Ensure the API allows requests from your Coolify domain
3. Check if API has CORS configured for your sites domain

### Authentication not working

1. Ensure cookies are being set (check `SameSite` attribute)
2. Verify your API's `AUTH_BASE_URL` matches your Coolify domain
3. Check Keycloak redirect URIs include your Coolify domain

### Styles/assets not loading

1. Clear browser cache
2. Check if assets are being served with correct MIME types
3. Verify the build completed successfully in Coolify logs

---

## Manual Docker Build

```bash
# From repository root
docker build -f apps/sites/docker/Dockerfile -t gruenerator-sites .

# Run
docker run -p 3000:3000 \
  -e API_BASE_URL=https://your-api.example.com \
  gruenerator-sites
```

---

## Updating

In Coolify, simply push to your Git repository and Coolify will automatically rebuild and deploy.

For manual updates:
```bash
docker-compose down
docker-compose up --build -d
```
