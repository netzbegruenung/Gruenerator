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
- **Tools** (14): `whoami`, `gruenerator_search`, `gruenerator_get_filters`, `gruenerator_examples_search`, `umfragen`, `find_content`, `documents`, `boards_tasks`, `notebooks`, `groups`, `media`, `create_document` (document/sheet/presentation), `create_board`. Implementations are **bridged from the chat agentic-loop tools** (`routes/chat/agents/personalDataTools.ts`) via `routes/mcp-server/chatToolBridge.ts` — change behavior there, not in a fork. Destructive/social writes use the in-band two-step `confirm=true` protocol.
- **Prompts + resources** (`routes/mcp-server/methodPrompts.ts`): prompts `recherche` and `notizbuch-antwort`, resources `gruenerator://methode` and `gruenerator://sammlungen`. They carry the retrieve-then-cite method to the calling model, which otherwise has none — no tool synthesizes the party-corpus answer for it. **Every protocol line is derived from `agents/langgraph/prompts.ts` via the `mcp` answer surface, never restated.** The two surfaces differ in exactly one thing: in the app the UI renders citations from the references map, so a final source list is forbidden; over MCP the client sees only text, so the list is mandatory. Add a surface parameter rather than a sixth copy of the protocol.
- **Search collections come from `getMcpExposedCollections()`**, NOT from `ALL_COLLECTIONS` in `routes/chat/agents/searchTools.ts`. That constant is the chat agent's allow-list (8 entries) and using it here silently hid every Landesverband from v2 while v1 served them. `gruenerator_get_filters` shares the Recherche page's 30-minute facet cache (`routes/research/researchController.ts`) — the aggregation fans out Qdrant facet queries and is far too costly per tool call.
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

## Spec revision 2026-07-28 — readiness

**The big changes are blocked on the SDK, not skipped.** `@modelcontextprotocol/sdk`
is at **1.30.0** (latest) and still declares `LATEST_PROTOCOL_VERSION = '2025-11-25'`.
Everything in the revision's *Major changes* list lives in the transport/protocol
layer that the SDK owns, so none of it is adoptable without forking the transport.
Don't write speculative shims — they'd be untestable dead code whose shape won't
match what the SDK eventually ships.

| Change | Owner | Our posture |
| --- | --- | --- |
| Remove `initialize` + `notifications/initialized` | SDK | Blocked. Both servers already tolerate a bare `tools/list` (stateless), so the migration is a no-op for us. |
| `server/discover` | SDK | Blocked. |
| `subscriptions/listen` (replaces GET stream + `resources/subscribe`) | SDK | Blocked, and irrelevant: neither server subscribes or streams. |
| MRTR / `InputRequiredResult`, `resultType` on every result | SDK | Blocked. |
| Remove `Mcp-Session-Id` | SDK | **Already aligned** — see below. |
| Remove SSE resumability / `Last-Event-ID` | SDK | **Already aligned** — no event store anywhere. |
| `CacheableResult` (`ttlMs`, `cacheScope`) | SDK | Blocked; the fields don't exist in 1.30's types. |
| `Mcp-Method` / `Mcp-Name` request headers | SDK | Blocked. |
| Error-code allocation policy | us | **Done** — see below. |
| Resource-not-found `-32002` → `-32602` | us | **Done** (v1 throws `ErrorCode.InvalidParams`, which already *is* `-32602`; v2 has no resources). |
| Deprecate Roots / Sampling / Logging | us | No-op: neither server uses any of them. |
| Deprecate HTTP+SSE transport | us | v1/v2 are Streamable-HTTP only. The outbound `UserMCPClient` keeps an SSE path for third-party servers whose URL ends in `/sse` — **deliberate back-compat**, not to be removed. |
| `iss` in authorization responses (RFC 9207) | mixed | Outbound client: **done** (validated in `McpOAuthService`). v2 as AS: **blocked on Better Auth** — its `mcp` plugin builds the redirect without `iss` and advertises no `authorization_response_iss_parameter_supported`. |
| `application_type` on DCR (SEP-837) | mixed | Outbound client: **done** (sends `web`). v2 as AS: **blocked on Better Auth** — `registerMcpClientBodySchema` has no such field and strips it. |
| DCR deprecated in favour of Client ID Metadata Documents | Better Auth / SDK | Blocked upstream; DCR remains the only registration path. Note only. |

**Two places we are already conformant — do not "fix" them backwards:**

1. **Stateless, no session id.** Both servers omit `sessionIdGenerator` and build a
   fresh `McpServer` per POST; `GET`/`DELETE` → 405. This is what keeps claude.ai
   and ChatGPT tool discovery working, and it is the direction 2026-07-28 codifies.
   `mcp-session-id` stays in v1's CORS `allowedHeaders` (permissive — stateful SDK
   clients still send it) but is *exposed* by neither server.
2. **No SSE resumability.** No event store, no `Last-Event-ID`.

**Error codes.** The revision splits the server-error range: `-32000..-32019`
implementation-defined, `-32020..-32099` reserved for the spec. Both servers now
keep their codes in the lower window (rate limiting moved `-32029` → `-32003`);
constants live at the top of `services/mcp/src/index.ts` and
`apps/api/routes/mcp-server/index.ts`.

**Known cosmetic mismatch:** the SDK's `McpServer` unconditionally registers
`tools.listChanged: true` and fires `sendToolListChanged()` on every
`registerTool`, even though a stateless transport can never deliver the
notification. Not worth working around.

**Trigger to revisit:** `services/mcp/src/protocol-version.vitest.ts` asserts the
SDK's `LATEST_PROTOCOL_VERSION` is still `2025-11-25`. It runs in CI, so the
dependabot PR that bumps `@modelcontextprotocol/sdk` past it goes red at exactly
the point the question becomes answerable — don't just update the string, work
back through this table. Separately, the smoke test
(`pnpm --filter @gruenerator/mcp smoke`) soft-checks that the *deployed* image
speaks the same revision, which catches image-behind-repo drift. No calendar
reminder needed for either.

### Testing v1 with curl

```bash
curl -s https://mcp.gruenerator.eu/health | jq
curl -s https://mcp.gruenerator.eu/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"gruenerator_search","arguments":{"query":"Klimaschutz","collection":"deutschland","limit":3}}}'
```
