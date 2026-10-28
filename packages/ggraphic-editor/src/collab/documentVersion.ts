// SPDX-License-Identifier: MPL-2.0
/**
 * The document version of a Y.Doc: where it lives (`meta`), how a client
 * reads it, lifts an older doc in place and stamps a fresh one. The rules are
 * in `@ggraphic/schema`'s `DOCUMENT_VERSIONING.md`; the steps themselves run
 * through `migrateDocument`, the same door every other load uses.
 *
 * The version is only ever raised, and the pages are written only where a
 * step changed a value, so an identity chain writes nothing at all and two
 * clients lifting the same doc write the same values.
 *
 * Call the writers inside the caller's `doc.transact` (its origin decides
 * whether undo tracks them; the editor uses its untracked setup origin).
 */
import {
  canvasPageSchema,
  documentMigrations,
  migrateDocument,
  newerVersion,
  type DocumentRefusal,
  type DocumentVersions,
  type MigrationRegistry,
} from '@ggraphic/schema';
import * as Y from 'yjs';

import {
  getMetaMap,
  getPagesMap,
  replacePageState,
  sameStateValue,
  serializeDeck,
} from './pagesDoc.js';
import { YDOC_KEYS } from './ydocKeys.js';

const isVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

const kindKey = (stateKey: string) => `${YDOC_KEYS.kindVersionPrefix}${stateKey}`;

type StoredVersions =
  | { ok: true; schemaVersion: number | null; kindVersions: Record<string, number> }
  | { ok: false; reason: string };

function readStored(doc: Y.Doc): StoredVersions {
  const meta = getMetaMap(doc);
  const schemaVersion = meta.get(YDOC_KEYS.schemaVersion);
  if (schemaVersion !== undefined && !isVersion(schemaVersion)) {
    return { ok: false, reason: `meta.${YDOC_KEYS.schemaVersion} is not a version` };
  }
  const kindVersions: Record<string, number> = {};
  for (const [key, value] of meta.entries()) {
    if (!key.startsWith(YDOC_KEYS.kindVersionPrefix)) continue;
    if (!isVersion(value)) return { ok: false, reason: `meta.${key} is not a version` };
    kindVersions[key.slice(YDOC_KEYS.kindVersionPrefix.length)] = value;
  }
  return { ok: true, schemaVersion: schemaVersion ?? null, kindVersions };
}

/** The versions the doc carries; an absent or malformed stamp reads as 1. */
export function readYDocVersions(
  doc: Y.Doc,
  registry: MigrationRegistry = documentMigrations
): DocumentVersions {
  const stored = readStored(doc);
  const known = registry.kindVersions();
  return {
    schemaVersion: stored.ok ? (stored.schemaVersion ?? 1) : 1,
    kindVersions: Object.fromEntries(
      Object.keys(known).map((key) => [key, (stored.ok && stored.kindVersions[key]) || 1])
    ),
  };
}

/**
 * Why this build must not write the doc — a newer version or a malformed
 * stamp — or `null`. A pure read; safe during render.
 */
export function readYDocRefusal(
  doc: Y.Doc,
  registry: MigrationRegistry = documentMigrations
): DocumentRefusal | null {
  const stored = readStored(doc);
  if (!stored.ok) return { status: 'invalid', reason: stored.reason };
  const newer = newerVersion(
    { schemaVersion: stored.schemaVersion ?? 1, kindVersions: stored.kindVersions },
    registry
  );
  return newer ? { ...newer, document: null } : null;
}

/** Raises the doc's stamps to `versions`; never lowers one. A kind at 1 needs no stamp. */
function raiseStamps(doc: Y.Doc, versions: DocumentVersions): void {
  const meta = getMetaMap(doc);
  const core = meta.get(YDOC_KEYS.schemaVersion);
  if (!isVersion(core) || core < versions.schemaVersion) {
    meta.set(YDOC_KEYS.schemaVersion, versions.schemaVersion);
  }
  for (const [stateKey, version] of Object.entries(versions.kindVersions)) {
    if (version <= 1) continue;
    const stored = meta.get(kindKey(stateKey));
    if (!isVersion(stored) || stored < version) meta.set(kindKey(stateKey), version);
  }
}

/** Stamps this build's versions into a doc it just seeded. */
export function stampYDocument(doc: Y.Doc, registry: MigrationRegistry = documentMigrations): void {
  raiseStamps(doc, { schemaVersion: registry.coreVersion, kindVersions: registry.kindVersions() });
}

export type YDocMigration = { status: 'current' } | { status: 'migrated' } | DocumentRefusal;

function replaceConfig(page: Y.Map<unknown>, config: Record<string, unknown>): void {
  const existing = page.get(YDOC_KEYS.config);
  if (!(existing instanceof Y.Map)) {
    if (Object.keys(config).length === 0) return;
    const map = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(config)) map.set(k, v);
    page.set(YDOC_KEYS.config, map);
    return;
  }
  for (const key of Array.from(existing.keys())) {
    if (!Object.hasOwn(config, key)) existing.delete(key);
  }
  for (const [k, v] of Object.entries(config)) {
    if (!sameStateValue(existing.get(k), v)) existing.set(k, v);
  }
}

/**
 * Lifts an older doc to this build's versions, in place: page state and
 * config are rewritten key by key where a step changed them, then the
 * stamps are raised. A step that changes the set of pages is refused
 * (`invalid`) and nothing is written.
 */
export function migrateYDocument(
  doc: Y.Doc,
  registry: MigrationRegistry = documentMigrations
): YDocMigration {
  const stored = readStored(doc);
  if (!stored.ok) return { status: 'invalid', reason: stored.reason };
  const pages = serializeDeck(doc);
  const result = migrateDocument(
    {
      ...(stored.schemaVersion !== null ? { schemaVersion: stored.schemaVersion } : {}),
      ...(Object.keys(stored.kindVersions).length > 0 ? { kindVersions: stored.kindVersions } : {}),
      pages,
    },
    registry
  );
  if (result.status === 'newer' || result.status === 'invalid') return result;
  if (result.status === 'current') return result;

  const lifted = (result.document.pages ?? []).map((entry) => canvasPageSchema.safeParse(entry));
  const sameSet =
    lifted.length === pages.length &&
    lifted.every((page, i) => page.success && page.data.id === pages[i]!.id);
  if (!sameSet) {
    return { status: 'invalid', reason: 'a migration step changed the set of pages' };
  }
  const pagesMap = getPagesMap(doc);
  for (const parsed of lifted) {
    if (!parsed.success) continue;
    const page = parsed.data;
    const yPage = pagesMap.get(page.id as string);
    if (!yPage) continue;
    if (yPage.get(YDOC_KEYS.configId) !== page.configId) {
      yPage.set(YDOC_KEYS.configId, page.configId);
    }
    replacePageState(doc, page.id as string, page.state);
    replaceConfig(yPage, page.config ?? {});
  }
  raiseStamps(doc, result.to);
  return { status: 'migrated' };
}
