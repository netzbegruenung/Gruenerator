// SPDX-License-Identifier: MPL-2.0
/**
 * The versioned canvas document: its envelope, the migration registry and the
 * one door every load goes through (`migrateDocument`). Design and the list of
 * load/write paths: `DOCUMENT_VERSIONING.md` at the package root.
 *
 * A document without a version is version 1 — every document stored before
 * versioning existed — and loads unchanged.
 */
import { z } from 'zod';

/** The core format version this build reads and writes. */
export const CANVAS_DOCUMENT_VERSION = 1;

const versionSchema = z.number().int().min(1);

/**
 * The envelope. Only the version fields are checked; pages and every other
 * key pass through untouched, so a host's own keys and a page this build
 * cannot read survive a load. `pages` is not even required to be a list:
 * stored documents predate this schema, and refusing one that opened before
 * would be a regression — a non-list simply has no pages to migrate.
 */
export const canvasDocumentSchema = z.looseObject({
  /** Core format version; absent = 1. */
  schemaVersion: versionSchema.optional(),
  /** Version of each host kind's list, by its state key; absent = 1. */
  kindVersions: z.record(z.string(), versionSchema).optional(),
  pages: z.unknown().optional(),
});

export type CanvasDocument = z.infer<typeof canvasDocumentSchema>;

/** A well-formed page; the shape migrations work on. */
export const canvasPageSchema = z.looseObject({
  id: z.string().optional(),
  configId: z.string(),
  state: z.record(z.string(), z.unknown()),
  config: z.record(z.string(), z.unknown()).optional(),
});

export type CanvasPage = z.infer<typeof canvasPageSchema>;

/** Lifts the whole document from `from` to `from + 1`. Pure, deterministic, idempotent. */
export interface CoreMigration {
  from: number;
  migrate(doc: CanvasDocument): CanvasDocument;
}

/**
 * Lifts the value under one state key, in every page that has it, from
 * `from` to `from + 1`. Pure, deterministic, idempotent.
 */
export interface StateKeyMigration {
  from: number;
  migrate(value: unknown): unknown;
}

/** `fn` applied to every well-formed page; any other entry stays as it is. */
export function mapPages(
  doc: CanvasDocument,
  fn: (page: CanvasPage) => CanvasPage
): CanvasDocument {
  if (!Array.isArray(doc.pages)) return doc;
  return {
    ...doc,
    pages: doc.pages.map((entry) => {
      const page = canvasPageSchema.safeParse(entry);
      return page.success ? fn(page.data) : entry;
    }),
  };
}

export interface MigrationRegistry {
  /** The core version this registry lifts documents to. */
  readonly coreVersion: number;
  /** The version of a registered host key, `null` for a key nobody registered. */
  kindVersion(stateKey: string): number | null;
  /** The registered host keys with their versions. */
  kindVersions(): Readonly<Record<string, number>>;
  /** Registers (or replaces) a host key's steps; no steps means version 1. */
  registerStateKey(stateKey: string, migrations: readonly StateKeyMigration[]): void;
  coreSteps(): readonly CoreMigration[];
  stateKeySteps(stateKey: string): readonly StateKeyMigration[];
}

function assertContiguous(steps: readonly { from: number }[], what: string): void {
  steps.forEach((step, i) => {
    if (step.from !== i + 1) {
      throw new Error(
        `${what}: steps must run from 1 without gaps, step ${i} starts at ${step.from}`
      );
    }
  });
}

export function createMigrationRegistry(core: readonly CoreMigration[]): MigrationRegistry {
  assertContiguous(core, 'core migrations');
  const hostSteps = new Map<string, readonly StateKeyMigration[]>();
  return {
    coreVersion: core.length + 1,
    kindVersion: (stateKey) => {
      const steps = hostSteps.get(stateKey);
      return steps ? steps.length + 1 : null;
    },
    kindVersions: () =>
      Object.fromEntries([...hostSteps].map(([key, steps]) => [key, steps.length + 1])),
    registerStateKey: (stateKey, migrations) => {
      assertContiguous(migrations, `migrations of "${stateKey}"`);
      hostSteps.set(stateKey, [...migrations]);
    },
    coreSteps: () => core,
    stateKeySteps: (stateKey) => hostSteps.get(stateKey) ?? [],
  };
}

/** The core's steps: none — version 1 is today's shape. */
const CORE_MIGRATIONS: readonly CoreMigration[] = [];

/** The registry every load uses unless a caller passes its own. */
export const documentMigrations: MigrationRegistry = createMigrationRegistry(CORE_MIGRATIONS);

/** A host kind's steps for its state key (`registerElementKind` forwards them). */
export function registerStateKeyMigrations(
  stateKey: string,
  migrations: readonly StateKeyMigration[]
): void {
  documentMigrations.registerStateKey(stateKey, migrations);
}

export interface DocumentVersions {
  schemaVersion: number;
  /** Only the host keys the registry knows. */
  kindVersions: Record<string, number>;
}

export type MigrateResult =
  /** Nothing to do: `document` is the input object itself. */
  | { status: 'current'; document: CanvasDocument }
  /** A lifted copy carrying its new versions. */
  | { status: 'migrated'; document: CanvasDocument; from: DocumentVersions; to: DocumentVersions }
  /** Written by a newer build: read it, never write it. `scope` null is the core. */
  | { status: 'newer'; scope: string | null; version: number; known: number; document: unknown }
  /** Not a document envelope. */
  | { status: 'invalid'; reason: string };

/** Why a document must not be written, or `null` when it may. */
export type DocumentRefusal = Extract<MigrateResult, { status: 'newer' | 'invalid' }>;

/** The versions a document carries, as this registry reads them. */
export function documentVersions(
  doc: Pick<CanvasDocument, 'schemaVersion' | 'kindVersions'>,
  registry: MigrationRegistry = documentMigrations
): DocumentVersions {
  const known = registry.kindVersions();
  return {
    schemaVersion: doc.schemaVersion ?? 1,
    kindVersions: Object.fromEntries(
      Object.keys(known).map((key) => [key, doc.kindVersions?.[key] ?? 1])
    ),
  };
}

/** A version this registry does not know, or `null`. */
export function newerVersion(
  stored: DocumentVersions,
  registry: MigrationRegistry = documentMigrations
): Extract<MigrateResult, { status: 'newer' }> | null {
  if (stored.schemaVersion > registry.coreVersion) {
    return {
      status: 'newer',
      scope: null,
      version: stored.schemaVersion,
      known: registry.coreVersion,
      document: null,
    };
  }
  for (const [key, version] of Object.entries(stored.kindVersions)) {
    const known = registry.kindVersion(key);
    if (known !== null && version > known) {
      return { status: 'newer', scope: key, version, known, document: null };
    }
  }
  return null;
}

/** `doc` lifted from `stored` to the registry's versions; the input is never mutated. */
function liftDocument(
  doc: CanvasDocument,
  stored: DocumentVersions,
  registry: MigrationRegistry
): CanvasDocument {
  // A JSON copy: documents are JSON at rest, and steps may then build on it freely.
  let lifted = JSON.parse(JSON.stringify(doc)) as CanvasDocument;
  for (const step of registry.coreSteps().slice(stored.schemaVersion - 1)) {
    lifted = step.migrate(lifted);
  }
  for (const [key, version] of Object.entries(stored.kindVersions)) {
    const steps = registry.stateKeySteps(key).slice(version - 1);
    if (steps.length === 0) continue;
    lifted = mapPages(lifted, (page) => {
      if (!Object.hasOwn(page.state, key)) return page;
      const value = steps.reduce((v, step) => step.migrate(v), page.state[key]);
      return { ...page, state: { ...page.state, [key]: value } };
    });
  }
  return lifted;
}

function withVersions(
  doc: CanvasDocument,
  from: DocumentVersions,
  to: DocumentVersions
): CanvasDocument {
  const out: CanvasDocument = { ...doc };
  if (to.schemaVersion !== from.schemaVersion || doc.schemaVersion !== undefined) {
    out.schemaVersion = to.schemaVersion;
  }
  const kinds = { ...doc.kindVersions };
  for (const [key, version] of Object.entries(to.kindVersions)) {
    if (version !== from.kindVersions[key] || kinds[key] !== undefined) kinds[key] = version;
  }
  if (Object.keys(kinds).length > 0) out.kindVersions = kinds;
  return out;
}

/**
 * The one door for loading a stored document. A document of today's version
 * comes back as the same object; an older one as a lifted copy; a newer or
 * malformed one as a refusal, so the caller shows it read-only.
 */
export function migrateDocument(
  raw: unknown,
  registry: MigrationRegistry = documentMigrations
): MigrateResult {
  const parsed = canvasDocumentSchema.safeParse(raw);
  if (!parsed.success) return { status: 'invalid', reason: parsed.error.message };
  // The parse result is a copy; hand back the caller's own object when nothing changes.
  const doc = raw as CanvasDocument;
  const from = documentVersions(doc, registry);
  const newer = newerVersion(from, registry);
  if (newer) return { ...newer, document: raw };
  const to = documentVersions(
    { schemaVersion: registry.coreVersion, kindVersions: registry.kindVersions() },
    registry
  );
  const behind =
    from.schemaVersion < to.schemaVersion ||
    Object.entries(from.kindVersions).some(([key, v]) => v < (to.kindVersions[key] ?? v));
  if (!behind) return { status: 'current', document: doc };
  return {
    status: 'migrated',
    document: withVersions(liftDocument(doc, from, registry), from, to),
    from,
    to,
  };
}

/**
 * `doc` with this build's versions, for writing: `schemaVersion` always,
 * `kindVersions` only for host kinds above 1 (absent reads as 1).
 */
export function stampDocument<T extends object>(
  doc: T,
  registry: MigrationRegistry = documentMigrations
): T & { schemaVersion: number; kindVersions?: Record<string, number> } {
  const kinds = {
    // Versions of kinds this build does not know stay as the document has them.
    ...(doc as Pick<CanvasDocument, 'kindVersions'>).kindVersions,
    ...Object.fromEntries(
      Object.entries(registry.kindVersions()).filter(([, version]) => version > 1)
    ),
  };
  return {
    ...doc,
    schemaVersion: registry.coreVersion,
    ...(Object.keys(kinds).length > 0 ? { kindVersions: kinds } : {}),
  };
}
