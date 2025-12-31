# [2.0.0](https://github.com/Movm/Gruenerator-MCP/compare/v1.0.0...v2.0.0) (2025-12-21)


### Features

* **api:** Standardize filter fields and add URL to search results ([018d8b5](https://github.com/Movm/Gruenerator-MCP/commit/018d8b5112650f6e7854657cd82579167f8121f1))
* **server:** Add ChatGPT Apps SDK compatibility ([a4b3304](https://github.com/Movm/Gruenerator-MCP/commit/a4b3304e4f3f0a866bad31e58ce81f2378a678db))
* **tools:** Add person search and examples search MCP tools ([d888f2e](https://github.com/Movm/Gruenerator-MCP/commit/d888f2eb1521eee279f5c62289a5a7ea644567bd))


### BREAKING CHANGES

* **api:** Filter field names changed:
- `title` → `primary_category` (oesterreich, deutschland)
- `section` → `primary_category` (bundestagsfraktion, gruene-de, gruene-at)
- `article_type` → `content_type` (kommunalwiki)
- `category` → `primary_category` (kommunalwiki)
- `topic` → `primary_category` (boell-stiftung)
- `region` removed (boell-stiftung)

# 1.0.0 (2025-12-21)


### Bug Fixes

* Install curl in Docker image for healthcheck ([6363f45](https://github.com/Movm/Gruenerator-MCP/commit/6363f458a0cbddaf2835937da378ce72c886c781))
* **tools:** Improve MCP tool descriptions and fix system prompt resource ([497eeee](https://github.com/Movm/Gruenerator-MCP/commit/497eeee972e4b07ef8ac69c105e89ee91a41d4e4))
* Use Mistral embeddings and Zod schemas for MCP tool ([92fc08c](https://github.com/Movm/Gruenerator-MCP/commit/92fc08c57c0ef018c9f98f76df719386dc90e101))


### Features

* Add HTTP transport and Docker support for Coolify hosting ([0ae4728](https://github.com/Movm/Gruenerator-MCP/commit/0ae4728c038c1c5f5a75251060d2b41df6a4bfeb))
* Add MCP auto-discovery and client config generation ([307b4f6](https://github.com/Movm/Gruenerator-MCP/commit/307b4f6d748054e03112587f1f980b82c206a0b4))
* Add startup logging for debugging deployments ([7169200](https://github.com/Movm/Gruenerator-MCP/commit/716920045d9b75c300251188b245ae112f8c3ae1))
* **cache:** Add semantic caching and metadata filtering ([4a2fcdc](https://github.com/Movm/Gruenerator-MCP/commit/4a2fcdcb38e7d3f145ec9be56e6808ee5805763f))
* **config:** Add boell-stiftung collection ([7894892](https://github.com/Movm/Gruenerator-MCP/commit/7894892224e095dc12b86fb63d203b3a387114b4))
* **config:** Add new collections and filterable fields configuration ([b1145cf](https://github.com/Movm/Gruenerator-MCP/commit/b1145cf9df056b9dfc2a7900f5c1c8107338e76b))
* **filters:** Add filter discovery tool and Qdrant helper ([684e22a](https://github.com/Movm/Gruenerator-MCP/commit/684e22a0e206cb4b345ae3628d37d003f384bd2c))
* **mcp:** Add MCP Resources and operational metrics ([7bd2f36](https://github.com/Movm/Gruenerator-MCP/commit/7bd2f36b9c165a23c6dc3ccc728ae75535e7f514))
* **resources:** Add system prompt resource and filter metadata ([e9239bd](https://github.com/Movm/Gruenerator-MCP/commit/e9239bd775cd0123e82390b8964d3886bb5c0ff9))
* **search:** Add hybrid search with German text optimization ([eae950e](https://github.com/Movm/Gruenerator-MCP/commit/eae950ec7f54127f6cb68a7ee85c84758f633988))
* **search:** Extend search tool with new collections and filters ([969c760](https://github.com/Movm/Gruenerator-MCP/commit/969c7604ee45ead57fa0dc3d657a3fa06a85d9c9))
* **server:** Register filters tool and system prompt resource ([a42a2e8](https://github.com/Movm/Gruenerator-MCP/commit/a42a2e8e4e66ce44fbf644b4a4d85bfde3ec9742))
* Support Qdrant Basic Auth as alternative to API key ([1342698](https://github.com/Movm/Gruenerator-MCP/commit/1342698b9fcfa6e53df8195044782f81289e48ce))
