/**
 * Presentation generation service (reveal.js decks, subtype 'presentations').
 *
 * Chat-side lifecycle of a deck: generate a structured deck from a prompt
 * (create_presentation intent / praesentation-erstellen forced tool), create
 * the collaborative_documents row, and seed the Y.Doc so the editor finds the
 * slides on first open. Also the server-side reader that renders a deck's
 * current state as markdown for @mention context injection.
 *
 * Mirrors sheets/SheetGenerationService.ts. Reveal-free on purpose: the Y.Doc
 * schema + markdown formatter come from @gruenerator/contracts, and the tiny
 * slide↔Y.Map mapping is kept local (like buildWorkbookSnapshot) so the API
 * image never pulls in the reveal.js editor package.
 */

import { promisify } from 'util';
import { gunzip, gzip } from 'zlib';

import {
  PRESENTATION_META_KEYS,
  PRESENTATION_SCHEMA_VERSION,
  PRESENTATION_YDOC_KEYS,
  formatSlidesAsMarkdown,
  slideLayoutSchema,
  type Slide,
  type SlideLayout,
} from '@gruenerator/contracts';
import * as Y from 'yjs';

import { collaborative_documents_init } from '../../database/schema/collaborative.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const log = createLogger('PresentationGeneration');

const PRESENTATIONS_SUBTYPE = 'presentations';

export const PRESENTATION_GENERATION_PROMPT = `Du bist ein Präsentations-Assistent für die Grünen. Erstelle eine vollständige Präsentation (Foliensatz) basierend auf der Beschreibung.

Antworte NUR mit einem JSON-Objekt in exakt diesem Format:
{
  "title": "Passender Präsentationstitel",
  "slides": [
    { "layout": "title", "title": "Titel der Präsentation", "body": "Untertitel oder Anlass", "notes": "" },
    { "layout": "content", "title": "Ausgangslage", "body": "- Erster Punkt\\n- Zweiter Punkt", "notes": "Kurze Sprechernotiz" }
  ]
}

Regeln:
- 5 bis 12 Folien
- Die erste Folie hat layout "title" (Deckblatt)
- Layouts: "title" = Titelfolie, "content" = Titel + Aufzählung, "split" = zweispaltig, "quote" = Zitat, "image" = Bildfolie
- "body" ist Markdown — nutze "- " für Aufzählungen. Stichpunkte statt Fließtext
- "notes" sind optionale Sprechernotizen (können leer sein)
- Erstelle realistische, vollständige Platzhalterinhalte
- Schreibe auf Deutsch mit geschlechtergerechter Sprache (Genderstern *)`;

export interface PresentationStructure {
  title: string;
  slides: Array<{
    layout: SlideLayout;
    title: string;
    body: string;
    notes: string;
  }>;
}

/** Parse the model's JSON (with a fenced-block fallback, like sheets/docs). */
export function parsePresentationStructure(content: string): PresentationStructure | null {
  const tryParse = (raw: string): PresentationStructure | null => {
    try {
      const parsed = JSON.parse(raw) as PresentationStructure;
      if (!parsed || typeof parsed.title !== 'string' || !Array.isArray(parsed.slides)) return null;
      const slides = parsed.slides
        .filter((s) => s && typeof s.title === 'string')
        .slice(0, 15)
        .map((s) => ({
          layout: slideLayoutSchema.safeParse(s.layout).success ? s.layout : 'content',
          title: String(s.title),
          body: typeof s.body === 'string' ? s.body : '',
          notes: typeof s.notes === 'string' ? s.notes : '',
        }));
      if (slides.length === 0) return null;
      return { title: parsed.title, slides };
    } catch {
      return null;
    }
  };

  const direct = tryParse(content.trim());
  if (direct) return direct;
  const match = content.match(/\{[\s\S]*\}/);
  return match ? tryParse(match[0]) : null;
}

/** Build a slide Y.Map (kept local to avoid importing the reveal editor pkg). */
function buildSlideYMap(slide: Slide): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set('id', slide.id);
  m.set('layout', slide.layout);
  m.set('title', slide.title);
  m.set('body', slide.body);
  m.set('notes', slide.notes);
  m.set('background', slide.background ?? null);
  m.set('transition', slide.transition ?? null);
  m.set('fragments', slide.fragments ?? false);
  return m;
}

function readSlideYMap(m: Y.Map<unknown>): Slide {
  return {
    id: String(m.get('id') ?? ''),
    layout: (m.get('layout') as SlideLayout) ?? 'content',
    title: String(m.get('title') ?? ''),
    body: String(m.get('body') ?? ''),
    notes: String(m.get('notes') ?? ''),
    background: (m.get('background') as string | null) ?? null,
    transition: (m.get('transition') as Slide['transition']) ?? null,
    fragments: Boolean(m.get('fragments') ?? false),
  };
}

function structureToSlides(structure: PresentationStructure): Slide[] {
  return structure.slides.map((s) => ({
    id: crypto.randomUUID(),
    layout: s.layout,
    title: s.title,
    body: s.body,
    notes: s.notes,
    background: null,
    transition: null,
    fragments: false,
  }));
}

/**
 * Create the collaborative_documents row and seed the Y.Doc (gzipped into
 * collaborative_documents_init) so the first editor open finds the slides
 * instead of seeding a blank deck.
 */
export async function createPresentationDocument(
  structure: PresentationStructure,
  userId: string
): Promise<{ id: string; title: string }> {
  const db = getPostgresInstance();
  const result = await db.query(
    `INSERT INTO collaborative_documents
      (title, created_by, last_edited_by, document_subtype, permissions, is_public)
     VALUES ($1, $2, $2, $3, $4, false)
     RETURNING id, title`,
    [
      structure.title,
      userId,
      PRESENTATIONS_SUBTYPE,
      JSON.stringify({ [userId]: { level: 'owner', granted_at: new Date().toISOString() } }),
    ]
  );
  const id = result[0].id as string;
  const title = result[0].title as string;

  try {
    const ydoc = new Y.Doc();
    const slidesArr = ydoc.getArray<Y.Map<unknown>>(PRESENTATION_YDOC_KEYS.slides);
    const meta = ydoc.getMap<unknown>(PRESENTATION_YDOC_KEYS.meta);
    ydoc.transact(() => {
      slidesArr.insert(0, structureToSlides(structure).map(buildSlideYMap));
      meta.set(PRESENTATION_META_KEYS.seeded, true);
      meta.set(PRESENTATION_META_KEYS.schemaVersion, PRESENTATION_SCHEMA_VERSION);
    });
    const compressed = await gzipAsync(Y.encodeStateAsUpdate(ydoc));
    await getDrizzleInstance()
      .insert(collaborative_documents_init)
      .values({ document_id: id, init_data: compressed })
      .onConflictDoNothing();
  } catch (err) {
    // Seed failure is non-fatal: the editor seeds a blank deck on open.
    log.warn(
      `Failed to seed presentation Y.Doc for ${id}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return { id, title };
}

export interface LoadedPresentationState {
  id: string;
  title: string;
  slides: Slide[];
}

/**
 * Server-side read of a deck's current state for @mention context. Reconstructs
 * the Y.Doc (snapshot + updates + init cascade, like loadSheetState) and reads
 * the slide array directly — no mutation-log folding, slides are plain Yjs
 * types.
 */
export async function loadPresentationState(
  presentationId: string,
  userId: string
): Promise<LoadedPresentationState | null> {
  const db = getPostgresInstance();

  const docResult = await db.query(
    `SELECT title FROM collaborative_documents
     WHERE id = $1::uuid AND document_subtype = $2 AND is_deleted = false
     AND (created_by = $3::uuid OR permissions ? $3::text
          OR id::text IN (SELECT gcs.content_id FROM group_content_shares gcs
                    INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $3::uuid AND gm.is_active = TRUE
                    WHERE gcs.content_type = 'collaborative_documents'))`,
    [presentationId, PRESENTATIONS_SUBTYPE, userId]
  );
  if (docResult.length === 0) return null;
  const title = docResult[0].title as string;

  const ydoc = new Y.Doc();
  let hasData = false;

  const snapshotResult = await db.query(
    `SELECT snapshot_data, created_at FROM yjs_document_snapshots
     WHERE document_id = $1 ORDER BY version DESC LIMIT 1`,
    [presentationId]
  );
  if (snapshotResult.length > 0) {
    Y.applyUpdate(ydoc, await gunzipAsync(snapshotResult[0].snapshot_data as Buffer));
    hasData = true;
    const updates = await db.query(
      `SELECT update_data FROM yjs_document_updates
       WHERE document_id = $1 AND created_at > $2 ORDER BY created_at ASC`,
      [presentationId, snapshotResult[0].created_at]
    );
    for (const row of updates) {
      Y.applyUpdate(ydoc, await gunzipAsync(row.update_data as Buffer));
    }
  } else {
    const updates = await db.query(
      `SELECT update_data FROM yjs_document_updates
       WHERE document_id = $1 ORDER BY created_at ASC`,
      [presentationId]
    );
    for (const row of updates) {
      Y.applyUpdate(ydoc, await gunzipAsync(row.update_data as Buffer));
      hasData = true;
    }
    if (!hasData) {
      // Freshly created via chat: only the init seed exists.
      const init = await db.query(
        `SELECT init_data FROM collaborative_documents_init WHERE document_id = $1`,
        [presentationId]
      );
      if (init.length > 0) {
        Y.applyUpdate(ydoc, await gunzipAsync(init[0].init_data as Buffer));
        hasData = true;
      }
    }
  }
  if (!hasData) return { id: presentationId, title, slides: [] };

  const slides = ydoc
    .getArray<Y.Map<unknown>>(PRESENTATION_YDOC_KEYS.slides)
    .toArray()
    .map(readSlideYMap);
  return { id: presentationId, title, slides };
}

/** Render a loaded deck as a markdown outline for LLM context injection. */
export function formatPresentationAsContext(state: LoadedPresentationState): string {
  return formatSlidesAsMarkdown(state.slides, state.title);
}
