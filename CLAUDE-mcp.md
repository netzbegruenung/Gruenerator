# MCP Server Reference

> Referenced from `CLAUDE.md`. The Grünerator MCP server (`services/mcp`) provides semantic search over Green party documents.

- **Public URL**: `https://mcp.gruenerator.eu`
- **Transport**: Streamable HTTP (`POST /mcp`) — requires `Accept: application/json, text/event-stream` header
- **Deploy**: via Salt (`states/gruenerator-docker`), NOT Coolify. Image `ghcr.io/netzbegruenung/gruenerator-mcp`.

### Collections (single source of truth + runtime catalog)

Collections are defined **once** in `apps/api/config/systemCollectionsConfig.ts` (`SYSTEM_COLLECTIONS`, keyed by `-system` id, carrying `key`/`qdrantCollection`/`mcpExposed`/`agentOnly` + per-field `mcpHidden`). `COLLECTION_MAP` and the MCP catalog derive from it — do **not** hand-maintain a parallel list. Adding a collection = one edit here.

The MCP no longer bundles the list: `services/mcp/src/catalog.ts` fetches the `mcpExposed` subset from `GET /api/v1/collections` at boot + on a 10-min TTL, with a static fallback. **Requires `GRUENERATOR_API_URL`** (set in the Salt compose to `http://api:3001`) — without it the MCP silently serves only the stale fallback and `notebooks_*` break. The `collection` tool params are `z.string()` (validated at runtime), so new collections work without an MCP rebuild.

## Endpoints

| Endpoint                    | Description                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `GET /health`               | Health check with uptime, cache stats, request counts            |
| `GET /metrics`              | Detailed metrics (memory, performance breakdown)                 |
| `GET /.well-known/mcp.json` | Auto-discovery manifest                                          |
| `GET /config/:client`       | Client-specific config (`claude`, `cursor`, `vscode`, `chatgpt`) |
| `GET /info`                 | Server info with all tools, resources, and collections           |
| `POST /mcp`                 | MCP protocol endpoint (JSON-RPC over Streamable HTTP)            |

## Available MCP Tools

| Tool                          | Description                                                    |
| ----------------------------- | -------------------------------------------------------------- |
| `gruenerator_search`          | Hybrid/vector/text search across party program collections     |
| `gruenerator_examples_search` | Find social media examples (Instagram/Facebook)                |
| `gruenerator_get_filters`     | Get available filter values for a collection before filtering  |
| `gruenerator_cache_stats`     | View embedding and search cache statistics                     |
| `get_client_config`           | Generate MCP client configurations                             |

## Testing with curl

```bash
# Health check
curl -s https://mcp.gruenerator.eu/health | jq

# Initialize MCP session
curl -s -D - https://mcp.gruenerator.eu/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl-test","version":"1.0.0"}}}'
# → Note the Mcp-Session-Id header in the response

# Call a tool (replace SESSION_ID)
curl -s https://mcp.gruenerator.eu/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"gruenerator_search","arguments":{"query":"Klimaschutz","collection":"deutschland","limit":3}}}'
```

## Testing in Claude Code

The MCP server is configured as a remote MCP server in this project. Tools are deferred-loaded — use `ToolSearch` to activate them, then call directly:

```
ToolSearch: "select:mcp__claude_ai_Gr_nerator__gruenerator_search"
→ then call mcp__claude_ai_Gr_nerator__gruenerator_search with query + collection
```
