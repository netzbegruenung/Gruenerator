# @ggraphic/editor

The brand-neutral canvas editor of ggraphic, built on react-konva. Licensed under the [Mozilla Public License 2.0](./LICENSE). Code moves in from the host app's editor package only once it passes the boundary check (`scripts/check-ggraphic-core-boundary.mjs`), file by file and bottom-up: a file moves when it carries no brand content and every file it imports has moved already.

Each file is its own entry point (a host imports `@ggraphic/editor/utils/snapping`, not a barrel), so a module keeps its identity and a test can mock it by that path. The export map in `package.json` lists every file.

So far it holds the editor's leaf modules: geometry and snapping, selection and keyboard helpers, the icon catalogue, the autosave store, the Yjs page document, and the stage primitives that need nothing else (`CanvasBackground`, `IconPrimitive`, `TransformHud`).
