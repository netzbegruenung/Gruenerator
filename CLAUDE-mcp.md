# MCP Server Reference

> Referenced from `CLAUDE.md`. Grünerator runs **two** MCP servers:
>
> 1. **v2 (authenticated, current)** — OAuth-protected, user-based tools, served **in-process by `apps/api`** at `POST /api/mcp-server`. Public URL: `https://mcp.gruenerator.eu/v2`. Code: `apps/api/routes/mcp-server/` (NOT `apps/api/routes/mcp/` — that is the user-managed *outbound* MCP client registry).
> 2. **v1 (public, DEPRECATED but alive)** — anonymous semantic search, standalone `services/mcp` at `https://mcp.gruenerator.eu/mcp`. No sunset date; new features go to v2 only.

## v2 — authenticated MCP server

- **Transport**: stateless streamable HTTP JSON (`POST /api/mcp-server`), fresh `McpServer` per request; GET/DELETE → 405.
- **Auth**: OAuth 2.1 via the Better Auth `mcp` plugin (`apps/api/config/betterAuth.ts`) — dynamic client registration + PKCE at `/api/auth/v2/mcp/{register,authorize,token}`. Keycloak stays the only IdP: authorize rides the existing Better Auth session, the login page resumes the flow, `/oauth/consent` (apps/web) shows the scope grant. Fallback auth: admin-minted `api_keys` Bearer tokens (scopes map literally onto MCP scopes; `*` = all).
- **Discovery**: `/.well-known/oauth-authorization-server` + `/.well-known/oauth-protected-resource` served by the API at the origin root (nginx proxies them on both `gruenerator.eu` and `mcp.gruenerator.eu`).
- **Scopes**: `search`, `content:read`, `content:write`, `groups:read`, `groups:write`, `media:read`, `media:write` (defined in `apps/api/config/mcpServer.ts`). Tools and per-tool actions are only *registered* for granted scopes.
- **Tools** (13): `whoami`, `gruenerator_search`, `gruenerator_examples_search`, `umfragen`, `find_content`, `documents`, `boards_tasks`, `notebooks`, `groups`, `media`, `create_document` (document/sheet/presentation), `create_board`. Implementations are **bridged from the chat agentic-loop tools** (`routes/chat/agents/personalDataTools.ts`) via `routes/mcp-server/chatToolBridge.ts` — change behavior there, not in a fork. Destructive/social writes use the in-band two-step `confirm=true` protocol.
- **Env**: `MCP_SERVER_ENABLED=true` gates the mount; `BETTER_AUTH_URL` is REQUIRED (OAuth issuer — discovery 500s without it); `MCP_SERVER_PUBLIC_URL` (default `https://mcp.gruenerator.eu/v2`), `MCP_SERVER_RATE_LIMIT` (default 60/min).
- **DB**: `ba_oauth_applications` / `ba_oauth_access_tokens` / `ba_oauth_consents` (migration `mcp_oauth_provider_tables.sql`, Drizzle schema `database/schema/oauthProvider.ts` — export keys MUST stay `oauthApplication`/`oauthAccessToken`/`oauthConsent`).

### Testing v2 with curl

```bash
# Discovery
curl -s https://mcp.gruenerator.eu/.well-known/oauth-protected-resource/v2 | jq
curl -s https://gruenerator.eu/.well-known/oauth-authorization-server | jq

# Unauthenticated → 401 + WWW-Authenticate challenge
curl -s -D - https://mcp.gruenerator.eu/v2 -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# With a token (OAuth access token or api_keys PAT)
curl -s https://mcp.gruenerator.eu/v2 \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"whoami","arguments":{}}}'
```

End-to-end OAuth: `npx @modelcontextprotocol/inspector` against the endpoint, or add it as a claude.ai custom connector (`https://mcp.gruenerator.eu/v2`).

## v1 — public MCP server (`services/mcp`, deprecated)

- **Public URL**: `https://mcp.gruenerator.eu` (`POST /mcp`) — requires `Accept: application/json, text/event-stream` header. `/info` and `/.well-known/mcp.json` carry a `deprecation` block pointing at v2.
- **Deploy**: via Salt (`states/gruenerator-docker`, external infra repo), NOT Coolify — the in-repo artifacts are the Docker image `ghcr.io/netzbegruenung/gruenerator-mcp`, `docker-compose.prod.yml` service `mcp` (port 3004) and the nginx `mcp.*` block. `GRUENERATOR_API_URL` is set in the Salt compose (`http://api:3001`).
- **Tools**: `gruenerator_search`, `gruenerator_examples_search`, `gruenerator_get_filters`, `gruenerator_cache_stats`, `get_client_config`, plus api-key-gated `notebooks_*` (superseded by v2's in-process notebook tools).

### Collections (single source of truth + runtime catalog)

Collections are defined **once** in `apps/api/config/systemCollectionsConfig.ts` (`SYSTEM_COLLECTIONS`, keyed by `-system` id, carrying `key`/`qdrantCollection`/`mcpExposed`/`agentOnly` + per-field `mcpHidden`). `COLLECTION_MAP` and the MCP catalog derive from it — do **not** hand-maintain a parallel list. Adding a collection = one edit here.

The v1 MCP no longer bundles the list: `services/mcp/src/catalog.ts` fetches the `mcpExposed` subset from `GET /api/v1/collections` at boot + on a 10-min TTL, with a static fallback. **Requires `GRUENERATOR_API_URL`** — without it the MCP silently serves only the stale fallback and `notebooks_*` break. The `collection` tool params are `z.string()` (validated at runtime), so new collections work without an MCP rebuild. v2 searches in-process (`routes/chat/agents/directSearchExecutors.ts`) and needs none of this.

### Testing v1 with curl

```bash
curl -s https://mcp.gruenerator.eu/health | jq
curl -s https://mcp.gruenerator.eu/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"gruenerator_search","arguments":{"query":"Klimaschutz","collection":"deutschland","limit":3}}}'
```
