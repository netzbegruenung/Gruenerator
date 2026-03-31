# Grünerator × Presenton Integration

## Architecture Decision: Separate Tables

Presenton and Grünerator use **different DB schemas** for presentations:

- **Presenton** (`presentations`, `slides`): stores generation metadata (content prompt, outlines, layout structure, tone, verbosity)
- **Grünerator** (`collaborative_presentations`, `presentation_slides`): stores collaboration metadata (user_id, permissions, is_public)

Sharing tables directly would require major schema changes to both apps. Instead:

### Approach: Copy-on-Edit

1. User generates presentation in Grünerator → stored in `collaborative_presentations`
2. User clicks "Bearbeiten" → Grünerator API copies the presentation to Presenton's `presentations` + `slides` tables
3. User edits in Presenton at `slides.gruenerator.com/presentation/{id}`
4. Changes saved in Presenton's tables
5. When user returns to Grünerator, we sync changes back (or just link to Presenton)

### Database

Both apps connect to the same PostgreSQL instance but use different tables.
Presenton tables are created by Alembic migrations (`MIGRATE_DATABASE_ON_STARTUP=true` on first run).

### Authentication

- Keycloak SSO via `keycloak_auth.py` middleware (FastAPI)
- NextAuth with Keycloak provider (Next.js)
- Both apps share the same Keycloak realm (`gruenerator`)

### LLM

- Presenton configured with `LLM=custom` pointing to LiteLLM proxy
- Same models as Grünerator backend

## Files Modified from Upstream

- `servers/fastapi/api/main.py` — added KeycloakAuthMiddleware
- `servers/fastapi/api/keycloak_auth.py` — NEW: JWT validation middleware
- `Dockerfile.gruenerator` — fresh multi-stage build
- `start.gruenerator.js` — no Ollama/MCP
- `nginx.gruenerator.conf` — no MCP routes

## Updating from Upstream

```bash
git fetch presenton-upstream
git subtree pull --prefix=services/presenton presenton-upstream main --squash
```

Re-apply customizations if they conflict with upstream changes.
