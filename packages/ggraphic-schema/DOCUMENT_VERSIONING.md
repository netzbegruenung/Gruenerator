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
| Initial document of a canvas (the host's stored initial state)                          | read       | host → `readInitialDocument` (`usePageManager.ts`) → `initialPages` seed / preview     | `migrateDocument`; a newer or malformed envelope comes back as a refusal and no pages; the host mounts no writing editor                              |
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
  (`f(f(x)) = f(x)`, and `f` of already lifted data is a no-op). This is
  tested, not trusted: `verifyMigrationRegistry(registry, corpus)` checks
  every registered core and host step over a corpus of stored documents, and
  the core and each host run it in their tests with their kinds registered.
  Determinism makes two clients migrating the same doc write identical
  values, which Yjs merges into one. Idempotence makes it harmless when a
  step meets data that is already lifted (a server seed that copied migrated
  pages but no stamp, two clients racing).
- Idempotence is **not** a repair mechanism. Steps run only when the stored
  version is below this build's. Data written in the old shape _after_ the
  stamp was raised — by an old bundle, or by a peer that lost the race but
  kept writing before its observer fired — reads as current, and no step
  runs again (see "Old writers" below).
- Host kinds register before the first load (`registerElementKind` at start
  up, before the first render). A load before that treats the kind's list as
  opaque: it is neither lifted nor refused.

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
  (`shell.schemaRefusal`).
- Initial document: `readInitialDocument` returns the refusal and no pages.
  The host must not mount a writing editor on it; the reference host shows an
  alert page instead, with the same wording as the shell.

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
  or above. The re-lift is triggered by the **stamp**, not the data: if the
  newer stamp wins, whatever the older client wrote in its own shape before
  it saw that stamp stays as written.
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

## Old writers

A writer that does not run this mechanism writes the old shape into a
document whose stamp is already raised: bundles from before it (desktop
builds, cached service workers, open tabs), server-side writers (below), a
peer in the short window before its observer sees a newer stamp. Such a
writer never touches the stamp, so every newer client then reads the doc as
`current` and never lifts that data. Idempotence does not help there. What
does:

- **Lenient readers.** For N releases after a step ships, the code that reads
  the migrated keys also accepts the previous shape (the step's input), so
  old-shape data written late still renders and edits correctly. Only after
  that window may a reader drop the old shape.
- **Old-shape detection.** A step whose input shape is recognisable can come
  with a detector; a load that finds old-shape data under a current stamp then
  re-lifts those keys (steps are idempotent, so this is safe). Not built yet:
  the first real step brings its detector, or justifies why lenient readers
  are enough.

## Risks

- **Server-side and out-of-hook Y.Doc writers** bypass the client lift and
  never check the stamp: the host's sync-server seed and state patches, its
  deck-changes endpoint, version restore, and the AI/chat edit paths that
  write a canvas through the server. With version 1 harmless; before the
  first v2 each must refuse a newer doc, or migrate what it writes, and the
  snapshot copies must carry the stamp.
- **Old bundles** keep writing the old shape (see "Old writers"): mitigated
  only by lenient readers and detectors, not by the stamp.
- A migration that rewrites a whole instance list races with a concurrent edit
  of that list on a not-yet-migrated peer; Yjs keeps one of the two values.
- Host top-level keys outside `pages` (the reference host's flat cover
  state in its initial state) are opaque to the core; a host step does not reach them.
