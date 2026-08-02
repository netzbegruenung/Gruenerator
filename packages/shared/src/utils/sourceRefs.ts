// Lives in @gruenerator/query so the standalone MCP server can use it without
// pulling in all of shared. Re-exported here because `apps/api` (which serves
// the v2 MCP server) depends on shared, not on query — both servers must derive
// the same ref from the same source.
export * from '@gruenerator/query/refs';
