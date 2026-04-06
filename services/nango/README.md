# Nango — OAuth Connector Middleware

Self-hosted [Nango](https://nango.dev) instance for managing OAuth connections to external services (Google, Microsoft, Atlassian, etc.).

## Setup

### 1. Create Postgres Database

```sql
CREATE DATABASE nango;
GRANT ALL PRIVILEGES ON DATABASE nango TO gruenerator;
```

### 2. Generate Encryption Key

```bash
openssl rand -base64 32
```

Add the result to `.env` as `NANGO_ENCRYPTION_KEY`.

### 3. Start Container

```bash
# From repo root
docker compose -f docker-compose.prod.yml up nango
```

### 4. Access Dashboard

Open `https://nango.gruenerator.eu` (or `http://localhost:3003` locally).

On first access, note the `NANGO_SECRET_KEY` from the dashboard and add it to `.env`.

### 5. Configure Providers

In the Nango dashboard, add these integrations:

| Integration Key | Provider | Scopes |
|---|---|---|
| `google` | Google | `drive.readonly`, `docs.readonly`, `sheets.readonly`, `userinfo.email` |
| `microsoft` | Microsoft | `Files.Read`, `Sites.Read.All`, `Team.ReadBasic.All`, `User.Read` |
| `jira` | Atlassian (Jira) | `read:jira-work`, `read:jira-user` |
| `confluence` | Atlassian (Confluence) | `read:confluence-content.all`, `read:confluence-space.summary` |

OAuth redirect URI for all providers: `https://nango.gruenerator.eu/oauth/callback`

## Architecture

```
Nango Container (nangohq/nango-server)
├── API Server (:3003)         ← Backend talks to this
├── Connect UI (:3009)         ← Users see this for OAuth flows
├── Token Storage (Postgres)   ← AES-256 encrypted
└── Token Refresh (automatic)  ← Handles OAuth refresh transparently
```

The Gruenerator API backend uses `@nangohq/node` SDK to:
- Trigger OAuth flows via session tokens
- Retrieve fresh access tokens for API calls
- Revoke tokens on disconnect

## Ports

| Port | Purpose |
|---|---|
| 3003 | Nango API + Dashboard |
| 3009 | Connect UI (OAuth flow frontend) |

## License

Nango is licensed under the Elastic License v2 (ELv2). Self-hosting for internal use is permitted. Reselling as a hosted service is not.
