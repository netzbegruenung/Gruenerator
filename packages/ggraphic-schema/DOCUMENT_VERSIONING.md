<!-- SPDX-License-Identifier: MPL-2.0 -->

# Canvas document versioning

ggraphic's neutral, public format is the **canvas document**: its pages, each
page's canvas state (element instance lists, rich text, styling keys) and the
element kinds that live in that state. Once the core is published, self-hosted
instances store such documents in databases nobody else can migrate. Every
change to the stored shape therefore needs a version number and a migration
_before_ the first foreign instance writes a document. This note records where
documents cross a storage boundary today and how versioning is wired in.

## What "the document" is

```ts
{
  schemaVersion?: number,            // core format version; absent = 1
  kindVersions?: Record<string, number>, // per host stateKey; absent = 1
  pages?: Array<{
    id?: string,                     // stable page id (deck patches address it)
    configId: string,                // which template config renders the page
    state: Record<string, unknown>,  // the page's canvas state
    config?: Record<string, unknown>,// per-page editor config (Yjs `config` map)
  }>,
  ...                                // anything else is opaque and passed through
}
```

A page's `state` holds the template's own fields (text keys, colours,
positions, rich text) and the element instance lists of every kind, keyed by
the kind's `stateKey`: `selectedIcons`/`iconStates`, `shapeInstances`,
`frameInstances`, `additionalTexts`, `illustrationInstances`,
`assetInstances`, `circleBadgeInstances`, `pillBadgeInstances`,
`userImageInstances`, `chartInstances`, `layerOrder`, plus the host kinds'
lists (`registerElementKind`, e.g. the test kind's `stampInstances`). All these keys
are F0: stored in canvases and templates, never renamed.

In a Y.Doc the same document is spread over shared types (`collab/pagesDoc.ts`):
`pagesById` (Y.Map of page Y.Maps with `id`, `configId`, `pos`, `state`,
`config`) and `meta` (seed watermark and one-shot legacy markers). The
pre-`pagesById` topologies (`pages` Y.Array, `legacy_root`, root `formState`)
are older than version 1; `migrateLegacyDoc` and
`foldLegacyFormStateIntoFirstPage` already lift them into the v1 shape on open
and stay as they are.

## Where documents are serialised and deserialised today

| Path                                                                                    | Direction  | Where                                                                                  | Covered by                                                                                                                                            |
| --------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collaborative Y.Doc (the host's sync server) and the local Y.Doc of a non-collab editor | read/write | `collab/useYjsPages.ts` (setup effect after sync, seeding), `collab/pagesDoc.ts`       | `migrateYDocument` runs in the setup transaction after the legacy lift; seeding stamps the version into `meta`; a newer doc refuses writes            |
| Page state ↔ component state                                                            | read/write | `useYjsPageStateSync`, `wrapCallbacksWithPageSync`, `yjsBinding.ts` (`config`)         | Runs only on a doc that passed the version check (the page manager mounts no live pages for a refused doc)                                            |
| Initial document of a canvas (the host's stored initial state)                          | read       | host → `readInitialDocument` (`usePageManager.ts`) → `initialPages` seed / preview     | `migrateDocument`; a newer or malformed envelope comes back as a refusal the host turns into read-only                                                |
| Gallery deck autosave (`metadata.content`)                                              | write      | `hooks/useDeckAutoSave.ts`                                                             | Stamped with `stampDocument` (`schemaVersion` beside `pages`, additive). No reader of `content.pages` exists today                                    |
| Legacy per-page autosave (`metadata.content.canvasState`)                               | write      | `hooks/useCanvasAutoSave.ts`                                                           | Disabled in the multi-page editor (`autoSave={false}`); left as is, its shape stays read-only for old drafts                                          |
| Host template snapshots (a template freezes a copy of a canvas)                         | read/write | host server: copies the Y.Doc's pages into a new canvas's initial state                | Read back through the initial-document path above. Server side not versioned in this change — see risks                                               |
| Server-side Y.Doc writers (seed, state patches, deck changes, version restore)          | write      | host server, outside the core                                                          | Not versioned in this change: they write v1 shapes into docs with no stamp, which reads as v1. Must be versioned before the first v2 — see risks      |
| Clipboard                                                                               | in memory  | `utils/canvasClipboard.ts` (session-level, never persisted)                            | Not a storage boundary; one session runs one version                                                                                                  |
| AI operations                                                                           | transient  | `@ggraphic/schema` `ai/operations.ts`, applied by `ai/applyOperation.ts` to live state | Applied to the already-migrated live state; ops are model output, never stored. Their schema is versioned with the package (semver), not per document |
| Mobile render (`/mobile-render`, WebView)                                               | transient  | renders `initialProps` handed in by the app                                            | Not stored; the WebView runs the deployed web code                                                                                                    |
| Export (PNG, PDF, PPTX)                                                                 | transient  | `export/` reads live state                                                             | Reads migrated live state; nothing stored                                                                                                             |

## Design

### (a) Version fields

- `schemaVersion` (integer ≥ 1) carries the **core** format version.
  `CANVAS_DOCUMENT_VERSION` in `@ggraphic/schema` is the version this build
  writes.
- `kindVersions` (stateKey → integer ≥ 1) carries the version of each **host
  kind's** list. Host kinds evolve with the host, not with the core; sharing
  one counter would let a host's v2 collide with the core's v2.
- Absent means 1, in both fields. The envelope is checked with Zod
  (`canvasDocumentSchema`); everything else in the object passes through
  untouched, so a host's own top-level keys (the reference host keeps flat
  cover keys next to `pages` in its initial state) survive.

### (b) Migration registry

`createMigrationRegistry(coreMigrations)` builds a registry; the core's
default registry (`documentMigrations`) ships with **no** steps, so
`CANVAS_DOCUMENT_VERSION` is 1 and loading is the identity.

- A core step is `{ from: n, migrate(doc) }` and lifts the whole document from
  n to n + 1. Steps must be contiguous from 1.
- A host step is `{ from: n, migrate(list) }` for one `stateKey`; it lifts the
  value under that key in every page's state. A host registers its steps with
  `ElementKindRegistration.migrations`; `registerElementKind` forwards them
  (`registerStateKeyMigrations`). A kind without steps is registered too, at
  version 1, so the registry knows the key and can refuse a newer one.
- Every step must be **pure, deterministic and idempotent**
  (`f(f(x)) = f(x)`). Determinism makes two clients migrating the same doc
  write identical values, which Yjs merges into one. Idempotence makes it
  harmless when a step meets data that is already lifted (a server seed that
  copied migrated pages but no stamp, two clients racing).

### (c) `migrateDocument(raw)` on every load, stamp on write

`migrateDocument` returns a discriminated result:

- `current` — nothing to do; `document` **is the input object** (byte-identical
  round-trip, no stamp added, nothing rewritten).
- `migrated` — a structured clone lifted step by step, carrying the new
  `schemaVersion` / `kindVersions`. Feeding it back yields `current`.
- `newer` — the document carries a version this build does not know (core, or
  a host kind this build has registered). Data is untouched.
- `invalid` — the envelope's version fields are malformed or the input is not
  an object.

Writers stamp with `stampDocument` (adds `schemaVersion`, and `kindVersions`
only for kinds above 1). Seeding a Y.Doc stamps `meta.schemaVersion`.

### (d) Forward compatibility

A client that sees a newer version must not write: it would store the old
shape into a newer document. `newer` and `invalid` both become a refusal:

- Y.Doc: `useYjsPages` skips the legacy lift, seeding and migration; its API
  marks the doc refused and its mutators do nothing. `usePageManager` then
  shows the doc's pages as a read-only preview (no page is bound to its
  Y.Map) and returns `schemaRefusal`; the shell shows an alert
  (`shell.newerSchema`).
- Initial document: `readInitialDocument` returns the refusal; the host passes
  `readOnly` and tells the user.

### (e) Yjs

- The version lives in the doc's `meta` map: `meta.schemaVersion` for the core
  and `meta['kindVersion:<stateKey>']` per host kind — flat keys, so two
  clients bumping different kinds do not overwrite each other's map.
- Only upgrade: `migrateYDocument` writes a version key only when the stored
  value is lower than the one it migrated to. It writes page values only where
  they differ (`replacePageState`'s JSON-equality guard), so an identity
  migration writes nothing at all.
- Migration runs once per doc in the setup transaction (`SETUP_ORIGIN`,
  untracked by undo), after the sync, never on the unsynced IndexedDB cache.
- Concurrent clients: same version → same deterministic writes, Yjs converges.
  Different versions: the meta observer re-checks on every remote change. A
  newer stamp flips the older client to read-only, live. A stamp that went
  _down_ (last-writer-wins between an older and a newer migrating client)
  makes the newer client re-run its idempotent migration and stamp again; the
  older one, now seeing a newer stamp, stops writing. No loop: a client writes
  only while the stored version is below its own, and stops once it is equal
  or above.
- Migrations must keep the page ids; a step that changes the set of pages is
  rejected as `invalid` on a Y.Doc (structural page ops are not migrations).

### (f) F0

Documents stored by the reference host today carry no version, so they **are** version 1,
unchanged. This change rewrites nothing at rest: opening a v1 Y.Doc runs the
identity chain and writes no key (not even a stamp); `initial_state` is read
as before. No stored field is renamed. The only new bytes are additive: a
`schemaVersion` key in the `meta` of newly seeded Y.Docs and in newly written
gallery deck drafts.

## Deliberately left out

- **Server-side writers and readers** (the reference host's sync-server
  internal API, its deck changes, version restore, template snapshots). With one
  version they are correct as they are; before the first v2 they must copy
  `meta.schemaVersion` into snapshots, and refuse or migrate before writing
  into a newer doc.
- **Rewriting at rest.** Old documents are lifted on open, lazily, never by a
  batch job.
- **Downgrades.** There is no `vN → vN-1`; an older client goes read-only.
- **Composer specs.** A host's content spec and composer are not the neutral
  format (decision of 27.10.2026) and are versioned by the host, if at all.
- **Per-element versions.** One number per namespace (core, each host kind) is
  enough; an element-level version would multiply the states to test.

## Risks

- Server-side Y.Doc writers bypass the client migration (see above). With
  version 1 harmless; the first v2 is blocked on them.
- Long-lived old bundles (desktop builds, cached service workers, released
  mobile WebViews of an old web deploy) predate this mechanism and will write
  v1 shapes into a v2 doc without looking. Idempotent steps make the next
  migrating client repair that, but only for keys a step rewrites.
- A migration that rewrites a whole instance list races with a concurrent edit
  of that list on a not-yet-migrated peer; Yjs keeps one of the two values.
- Host top-level keys outside `pages` (the reference host's flat cover
  state in its initial state) are opaque to the core; a host step does not reach them.
