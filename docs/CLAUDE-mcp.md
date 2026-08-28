# MCP Server Reference

> Referenced from `CLAUDE.md`. Es gibt **einen** Grünerator-MCP: OAuth-geschützt,
> nutzerbezogen, **in-process von `apps/api`** unter `POST /api/mcp-server`.
> Öffentlich: `https://mcp.gruenerator.eu` — `/v2` und `/mcp` bleiben dauerhafte
> Aliasse auf dieselbe Adresse (URLs sind F0). Code: `apps/api/routes/mcp-server/`
> (NICHT `apps/api/routes/mcp/` — das ist die nutzerverwaltete *ausgehende*
> MCP-Client-Registry, und auch nicht `apps/api/services/mcp/`, die deren
> Laufzeit ist).
>
> **Anonymen Zugang gibt es nicht mehr.** Der frühere Paketserver `services/mcp`
> ist entfernt; Clients, die `/mcp` ohne Token ansprechen, bekommen 401 mit
> `WWW-Authenticate` und finden daraus selbst in den Anmeldeweg.

## Der Server

- **Transport**: stateless streamable HTTP JSON (`POST /api/mcp-server`), fresh `McpServer` per request; GET/DELETE → 405.
- **Auth**: OAuth 2.1 via the Better Auth `mcp` plugin (`apps/api/config/betterAuth.ts`) — dynamic client registration + PKCE at `/api/auth/v2/mcp/{register,authorize,token}`. Keycloak stays the only IdP: authorize rides the existing Better Auth session, the login page resumes the flow, `/oauth/consent` (apps/web) shows the scope grant. Fallback auth: admin-minted `api_keys` Bearer tokens. **`permissions` und `MCP_SCOPES` sind zwei verschiedene Mengen** — die Zuordnung steht in `API_KEY_PERMISSION_SCOPES` (`routes/mcp-server/mcpAuth.ts`): `notebooks:read` öffnet `search`, `*` alles. Ein direkt vergebener MCP-Scope wird weiterhin wörtlich übernommen.
- **Discovery**: `/.well-known/oauth-authorization-server` + `/.well-known/oauth-protected-resource` served by the API at the origin root (nginx proxies them on both `gruenerator.eu` and `mcp.gruenerator.eu`).
- **Scopes**: `search`, `content:read`, `content:write`, `groups:read`, `groups:write`, `media:read`, `media:write` (defined in `apps/api/config/mcpServer.ts`). Tools and per-tool actions are only *registered* for granted scopes.
- **Tools** (14 + 3): `whoami`, `gruenerator_search`, `gruenerator_get_filters`, `gruenerator_examples_search`, `umfragen`, `find_content`, `documents`, `boards_tasks`, `notebooks`, `groups`, `media`, `create_document` (document/sheet/presentation), `create_board`. Dazu die drei Landesverbands-Werkzeuge `notebooks_list`, `notebooks_search`, `notebooks_get_filters` — sie hängen **an keinem OAuth-Scope**, sondern an `api_keys.scopes.landesverbaende` (`routes/mcp-server/landesverbandTools.ts`). Als Eintrag in `MCP_SCOPES` stünden sie in `MCP_DEFAULT_SCOPE`, und ein claude.ai-Client, der ohne `scope`-Parameter anfragt, bekäme sie mitgeliefert, ohne je einen Landesverband zu haben — dasselbe Argument, das `CHAT_COMPLETIONS_SCOPE` außerhalb der Liste hält. Implementations are **bridged from the chat agentic-loop tools** (`routes/chat/agents/personalDataTools.ts`) via `routes/mcp-server/chatToolBridge.ts` — change behavior there, not in a fork. Destructive/social writes use the in-band two-step `confirm=true` protocol.
- **Prompts + resources**: `recherche` und `notebook-antwort` plus die Resources `gruenerator://methode` und `gruenerator://sammlungen` (`routes/mcp-server/methodPrompts.ts`); dazu die Grünerator-Agenten als Prompts, direkt aus `packages/shared/src/agents/mcpProjection.ts` gelesen (`routes/mcp-server/agentPrompts.ts` — der frühere Codegen nach `agents.generated.ts` entfällt, `apps/api` hängt ohnehin an `@gruenerator/shared`). Prompts hängen an keinem Scope: sie sind reiner Text und geben nichts frei. They carry the retrieve-then-cite method to the calling model, which otherwise has none — no tool synthesizes the party-corpus answer for it. **Every protocol line is derived from `agents/langgraph/prompts.ts` via the `mcp` answer surface, never restated.** The two surfaces differ in exactly one thing: in the app the UI renders citations from the references map, so a final source list is forbidden; over MCP the client sees only text, so the list is mandatory. Add a surface parameter rather than a sixth copy of the protocol.
- **Search collections come from `getMcpExposedCollections()`**, NOT from `ALL_COLLECTIONS` in `routes/chat/agents/searchTools.ts`. That constant is the chat agent's allow-list (8 entries) and using it here silently hid every Landesverband from the MCP surface. `gruenerator_get_filters` shares the Recherche page's 30-minute facet cache (`routes/research/researchController.ts`) — the aggregation fans out Qdrant facet queries and is far too costly per tool call.
- **Env**: `MCP_SERVER_ENABLED=true` gates the mount; `BETTER_AUTH_URL` is REQUIRED (OAuth issuer — discovery 500s without it); `MCP_SERVER_PUBLIC_URL` (default `https://mcp.gruenerator.eu` — **das ist zugleich die OAuth-`resource`**, aus der sich der Discovery-Pfad ableitet; eine Änderung entwertet bestehende DCR-Registrierungen), `MCP_SERVER_RATE_LIMIT` (default 60/min).
- **DB**: `ba_oauth_applications` / `ba_oauth_access_tokens` / `ba_oauth_consents` (migration `mcp_oauth_provider_tables.sql`, Drizzle schema `database/schema/oauthProvider.ts` — export keys MUST stay `oauthApplication`/`oauthAccessToken`/`oauthConsent`).

### Mit curl testen

```bash
# Discovery
curl -s https://mcp.gruenerator.eu/.well-known/oauth-protected-resource | jq
curl -s https://gruenerator.eu/.well-known/oauth-authorization-server | jq

# Unauthenticated → 401 + WWW-Authenticate challenge
curl -s -D - https://mcp.gruenerator.eu -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# With a token (OAuth access token or api_keys PAT)
curl -s https://mcp.gruenerator.eu \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"whoami","arguments":{}}}'
```

End-to-end OAuth: `npx @modelcontextprotocol/inspector` against the endpoint, or add it as a claude.ai custom connector (`https://mcp.gruenerator.eu`).

- **Deploy**: kein eigener Container mehr — der Server läuft im `api`-Image. Die
  nginx-`mcp.*`-Blöcke leiten Wurzel, `/v2` und `/mcp` auf `/api/mcp-server`; die
  Salt-Kopie im externen Infra-Repo braucht dieselbe Änderung. Bewusst nicht
  übernommen aus dem alten Server: `gruenerator_cache_stats` und
  `get_client_config` (Diagnose- bzw. Einrichtungshelfer — das erledigt die
  Doku-Seite) sowie die `country`-getriebene Mehrsammlungs-Suche (v1s Ersatz für
  ein fehlendes `collection`-Enum, das es hier gibt).

### `structuredContent` + `ref` — Zitieren über Aufrufe hinweg

Suchtools liefern ihr Ergebnis **zweimal**: als Text in `content` und als Objekt in `structuredContent`. Drei Fallen, alle gegen SDK 1.30 gemessen:

- **`content` wird NICHT abgeleitet.** Wer nur `structuredContent` zurückgibt, liefert `content: []`. Beide bauen, immer.
- **Sobald ein Tool `outputSchema` deklariert, ist `structuredContent` auf jedem ERFOLGREICHEN Pfad Pflicht** — sonst `-32602 Output validation error`. Fehlerpfade sind ausgenommen: `validateToolOutput` steigt bei `isError` vorher aus. Deshalb nur Felder als required deklarieren, die **jeder** Erfolgszweig setzt (der „keine Treffer"-Zweig hat kein `documentGroups`).
- **Objekt an der Wurzel**, `normalizeObjectSchema` erzwingt es — Trefferlisten wrappen.

`ref` (`buildSourceRef` aus `@gruenerator/query/refs`) ist der stabile Zitatschlüssel, aus der **URL** abgeleitet — nicht aus `document_id`: die fehlt in 4 von 7 befüllten Sammlungen, und wo sie existiert, ist sie inhaltsabgeleitet (`lv_${md5(text)}`) und wechselt bei jeder Textänderung. `rank` gilt nur innerhalb einer Antwort. Zwei Treffer mit gleichem `ref` sind zwei Belegstellen derselben Quelle — kein Fehler. Die Nummerierung macht der Client, nicht der Server: über MCP schreibt er die Antwort, wir haben keinen Vorgangszustand (Gegenstück im Chat: `agenticLoop/sourceRegistry.ts`).

**Wo eine URL erst absolutiert wird (Notebooks), wird der ROHE gespeicherte Wert gehasht** — `absolutizeUrl` hängt `APP_BASE_URL` an, und dasselbe Dokument bekäme sonst auf Test und Prod verschiedene refs.

**Nicht jedes Tool braucht ein `outputSchema`.** `notebooks` mit `action="search"` hat bewusst keins: es liefert eine fertige belegte Antwort, kein Material zum Weiterverarbeiten, und ein Schema zwänge `list`/`rename`/`delete` samt confirm-Rückfrage in eine gemeinsame Hülle — `registerAiTool` reicht nur Text durch, jeder übersehene Erfolgszweig wäre ein `-32602` auf einem funktionierenden Tool. Der `ref` steht dort in der Quellenzeile. Dieselbe Überlegung hält `whoami` und `umfragen` schemafrei: daraus zitiert niemand.

### Collections (single source of truth + runtime catalog)

Collections are defined **once** in `apps/api/config/systemCollectionsConfig.ts` (`SYSTEM_COLLECTIONS`, keyed by `-system` id, carrying `key`/`qdrantCollection`/`mcpExposed`/`agentOnly` + per-field `mcpHidden`). `COLLECTION_MAP` and the MCP catalog derive from it — do **not** hand-maintain a parallel list. Adding a collection = one edit here.

Der Server liest sie in-process (`getMcpExposedCollections()` → `routes/chat/agents/directSearchExecutors.ts`). Den früheren Laufzeit-Katalog über `GET /api/v1/collections` samt `GRUENERATOR_API_URL` braucht es nicht mehr — er war die Folge davon, dass der alte Paketserver ohne Zugriff auf die Konfiguration baute.

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
| Resource-not-found `-32002` → `-32602` | us | **Done** — die Resource-Handler werfen `ErrorCode.InvalidParams`, was bereits `-32602` *ist*. |
| Deprecate Roots / Sampling / Logging | us | No-op: neither server uses any of them. |
| Deprecate HTTP+SSE transport | us | Der Server ist Streamable-HTTP only. The outbound `UserMCPClient` keeps an SSE path for third-party servers whose URL ends in `/sse` — **deliberate back-compat**, not to be removed. |
| `iss` in authorization responses (RFC 9207) | mixed | Outbound client: **done** (validated in `McpOAuthService`). Als AS: **blocked on Better Auth** — its `mcp` plugin builds the redirect without `iss` and advertises no `authorization_response_iss_parameter_supported`. |
| `application_type` on DCR (SEP-837) | mixed | Outbound client: **done** (sends `web`). Als AS: **blocked on Better Auth** — `registerMcpClientBodySchema` has no such field and strips it. |
| DCR deprecated in favour of Client ID Metadata Documents | Better Auth / SDK | Blocked upstream; DCR remains the only registration path. Note only. |

**Two places we are already conformant — do not "fix" them backwards:**

1. **Stateless, no session id.** Der Server lässt `sessionIdGenerator` weg und baut
   pro POST einen frischen `McpServer`; `GET`/`DELETE` → 405. Genau das hält die
   Werkzeug-Erkennung von claude.ai und ChatGPT am Laufen, und es ist die
   Richtung, die 2026-07-28 festschreibt.
2. **No SSE resumability.** No event store, no `Last-Event-ID`.

**Error codes.** The revision splits the server-error range: `-32000..-32019`
implementation-defined, `-32020..-32099` reserved for the spec. Both servers now
keep their codes in the lower window (rate limiting moved `-32029` → `-32003`);
die Konstanten stehen oben in `apps/api/routes/mcp-server/index.ts`.

**Known cosmetic mismatch:** the SDK's `McpServer` unconditionally registers
`tools.listChanged: true` and fires `sendToolListChanged()` on every
`registerTool`, even though a stateless transport can never deliver the
notification. Not worth working around.

**Trigger to revisit:** `apps/api/routes/mcp-server/protocol-version.vitest.ts`
asserts the SDK's `LATEST_PROTOCOL_VERSION` is still `2025-11-25`. It runs in CI,
so the dependabot PR that bumps `@modelcontextprotocol/sdk` past it goes red at
exactly the point the question becomes answerable — don't just update the string,
work back through this table. (Der Test lag bis zur Zusammenlegung in
`services/mcp`; mit dem Paket wäre der Auslöser ersatzlos gestorben.)
