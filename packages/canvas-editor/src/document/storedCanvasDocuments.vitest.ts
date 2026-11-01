/**
 * The Grünerator's stored canvas documents carry no version: they are
 * version 1. They migrate to the package's current version (3) by one change,
 * the `schemaVersion` stamp, and a second pass leaves them alone. The corpus is every
 * composer golden, shaped the way the API stores a canvas
 * (`canvasStateService.getCanvasSnapshotState`: page 1's state flat beside
 * `pages`), plus a page with every element kind, the Balken included.
 */
import { readdirSync, readFileSync } from 'node:fs';

import { readInitialDocument } from '@ggraphic/editor/hooks/usePageManager';
import { registerElementKind } from '@ggraphic/editor/utils/elementKinds';
import {
  CANVAS_DOCUMENT_VERSION,
  documentMigrations,
  migrateDocument,
  verifyMigrationRegistry,
} from '@ggraphic/schema';
import { beforeAll, describe, expect, it } from 'vitest';

import { BALKEN_KIND } from '../brand/balkenKind';

const GOLDEN_DIR = new URL('../composer/__golden__/', import.meta.url);

interface Composed {
  templateType: string;
  slides: Record<string, unknown>[];
}

/** A composed sharepic as the API stores it in `initial_state`. */
const asStored = (composed: Composed) => ({
  ...composed.slides[0],
  pages: composed.slides.map((state, i) => ({
    id: `seed-${i}`,
    configId: composed.templateType,
    state,
  })),
});

const EVERY_KIND_PAGE = {
  backgroundColor: '#005538',
  balkenInstances: [
    {
      id: 'k-balken',
      mode: 'triple',
      colorSchemeId: 'tanne-sand',
      widthScale: 1,
      offset: { x: 40, y: 600 },
      scale: 1,
      texts: ['Eins', 'Zwei', 'Drei'],
      rotation: 3,
      opacity: 0.9,
    },
  ],
  selectedIcons: ['k-icon'],
  iconStates: { 'k-icon': { x: 100, y: 120, scale: 1.5, rotation: 10, color: '#FFF17A' } },
  layerOrder: ['k-balken', 'k-icon'],
};

const CORPUS: [string, string][] = [
  ...readdirSync(GOLDEN_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file): [string, string] => [
      file,
      JSON.stringify(
        asStored(JSON.parse(readFileSync(new URL(file, GOLDEN_DIR), 'utf8')) as Composed)
      ),
    ]),
  [
    'everyKind',
    JSON.stringify({
      ...EVERY_KIND_PAGE,
      pages: [{ id: 'p1', configId: 'freeform', state: EVERY_KIND_PAGE }],
    }),
  ],
];

beforeAll(() => registerElementKind(BALKEN_KIND));

describe('stored Grünerator canvas documents', () => {
  it('covers the composer goldens', () => {
    expect(CORPUS.length).toBeGreaterThan(40);
  });

  it('knows the Balken at version 1', () => {
    expect(documentMigrations.kindVersion('balkenInstances')).toBe(1);
  });

  it('every registered step is pure, deterministic and idempotent over the corpus', () => {
    const samples = CORPUS.map(([, stored]) => JSON.parse(stored) as unknown);
    expect(verifyMigrationRegistry(documentMigrations, samples)).toEqual([]);
  });

  it('is at version 3', () => {
    expect(CANVAS_DOCUMENT_VERSION).toBe(3);
  });

  it.each(CORPUS)('%s loads as migrated, only the version stamp added', (_name, stored) => {
    const raw = JSON.parse(stored) as Record<string, unknown>;
    const result = migrateDocument(raw);
    expect(result.status).toBe('migrated');
    if (result.status !== 'migrated') return;
    expect(result.document).toEqual({ ...raw, schemaVersion: CANVAS_DOCUMENT_VERSION });
    expect(JSON.parse(stored)).toEqual(raw);
  });

  it.each(CORPUS)('%s is idempotent on a second pass', (_name, stored) => {
    const first = migrateDocument(JSON.parse(stored));
    if (first.status !== 'migrated') throw new Error('expected a migration');
    const second = migrateDocument(first.document);
    expect(second.status).toBe('current');
    if (second.status !== 'current') return;
    expect(second.document).toEqual(first.document);
  });

  it.each(CORPUS)('%s seeds its pages unchanged', (_name, stored) => {
    const raw = JSON.parse(stored) as { pages: { state: unknown }[] };
    const read = readInitialDocument(raw);
    expect(read.refusal).toBeNull();
    expect(read.pages).toHaveLength(raw.pages.length);
    read.pages!.forEach((page, i) => expect(page.state).toEqual(raw.pages[i]!.state));
  });

  it.each([
    [2, 'migrated'],
    [3, 'current'],
  ] as const)('opens a stored version %i document editable (%s)', (version, status) => {
    const raw = { ...(JSON.parse(CORPUS[0]![1]) as { pages: unknown[] }), schemaVersion: version };
    const result = migrateDocument(raw);
    expect(result.status).toBe(status);
    const read = readInitialDocument(raw);
    expect(read.refusal).toBeNull();
    expect(read.pages).toHaveLength(raw.pages.length);
  });

  it('still refuses a stored version 4 document', () => {
    const raw = { ...JSON.parse(CORPUS[0]![1]), schemaVersion: 4 };
    expect(readInitialDocument(raw).refusal).toMatchObject({ status: 'newer', version: 4 });
  });

  it('refuses a document whose Balken are newer than this build', () => {
    const raw = { ...JSON.parse(CORPUS[0]![1]), kindVersions: { balkenInstances: 2 } };
    expect(readInitialDocument(raw).refusal).toMatchObject({
      status: 'newer',
      scope: 'balkenInstances',
    });
  });
});
