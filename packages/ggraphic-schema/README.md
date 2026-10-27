# @ggraphic/schema

The document format of the ggraphic design editor: the rich-text model and the inline-mark and list rules every text in a design follows. Licensed under the [Mozilla Public License 2.0](./LICENSE). Code moves in only once it passes the boundary check.

Unlike `@ggraphic/core` it has a real build (`dist/`): services that load their contracts at runtime with Node read it from there. In the monorepo, type checks and the Vite and Metro bundles read `src/` directly.
