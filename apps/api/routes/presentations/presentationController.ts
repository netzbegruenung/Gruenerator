import { Router, type Request, type Response } from 'express';

import { runSlidesGraph } from '../../agents/langgraph/SlidesGraph/index.js';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('Presentations');

interface PermissionEntry {
  level: 'owner' | 'editor' | 'viewer';
  granted_at: string;
  granted_by?: string;
}

interface PresentationPermissions {
  [userId: string]: PermissionEntry;
}

interface PresentationRow {
  id: string;
  title: string;
  user_id: string;
  language: string;
  theme: Record<string, unknown>;
  template: string;
  permissions: PresentationPermissions | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface SlideRow {
  id: string;
  presentation_id: string;
  index: number;
  layout_group: string;
  layout: string;
  content: Record<string, unknown>;
  speaker_note: string | null;
  properties: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const router = Router();
const db = getPostgresInstance();

function hasAccess(
  presentation: PresentationRow,
  userId: string,
  requiredLevel?: 'owner' | 'editor'
): boolean {
  if (presentation.user_id === userId) return true;
  const perm = presentation.permissions?.[userId];
  if (!perm) return false;
  if (!requiredLevel) return true;
  if (requiredLevel === 'owner') return perm.level === 'owner';
  return perm.level === 'owner' || perm.level === 'editor';
}

function toCamelCase(row: SlideRow) {
  return {
    id: row.id,
    presentationId: row.presentation_id,
    index: row.index,
    layoutGroup: row.layout_group,
    layout: row.layout,
    content: row.content,
    speakerNote: row.speaker_note,
    properties: row.properties,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function presentationToCamelCase(row: PresentationRow) {
  return {
    id: row.id,
    title: row.title,
    userId: row.user_id,
    language: row.language,
    theme: row.theme,
    template: row.template,
    permissions: row.permissions || {},
    isPublic: row.is_public,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/presentations — List all presentations for user
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Nicht autorisiert' });

  try {
    const result = await db.query<PresentationRow>(
      `SELECT * FROM collaborative_presentations
       WHERE user_id = $1
          OR permissions ? $1::text
       ORDER BY updated_at DESC`,
      [userId]
    );

    res.json(result.map(presentationToCamelCase));
  } catch (err) {
    log.error('Failed to list presentations', err);
    res.status(500).json({ error: 'Fehler beim Laden der Präsentationen' });
  }
});

// GET /api/presentations/:id — Get presentation with slides
router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ error: 'Nicht autorisiert' });

  try {
    const presResult = await db.query<PresentationRow>(
      'SELECT * FROM collaborative_presentations WHERE id = $1',
      [id]
    );
    const presentation = presResult[0];
    if (!presentation) return res.status(404).json({ error: 'Präsentation nicht gefunden' });
    if (!hasAccess(presentation, userId)) {
      return res.status(403).json({ error: 'Kein Zugriff' });
    }

    const slidesResult = await db.query<SlideRow>(
      'SELECT * FROM presentation_slides WHERE presentation_id = $1 ORDER BY index ASC',
      [id]
    );

    res.json({
      ...presentationToCamelCase(presentation),
      slides: slidesResult.map(toCamelCase),
    });
  } catch (err) {
    log.error('Failed to get presentation', err);
    res.status(500).json({ error: 'Fehler beim Laden der Präsentation' });
  }
});

// POST /api/presentations — Create blank presentation
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Nicht autorisiert' });

  const { title, language, template } = req.body;

  try {
    const permissions: PresentationPermissions = {
      [userId]: { level: 'owner', granted_at: new Date().toISOString() },
    };

    const result = await db.query<PresentationRow>(
      `INSERT INTO collaborative_presentations (title, user_id, language, template, permissions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        title || 'Neue Präsentation',
        userId,
        language || 'de',
        template || 'general',
        JSON.stringify(permissions),
      ]
    );

    res.status(201).json(presentationToCamelCase(result[0]!));
  } catch (err) {
    log.error('Failed to create presentation', err);
    res.status(500).json({ error: 'Fehler beim Erstellen der Präsentation' });
  }
});

// PUT /api/presentations/:id — Update presentation metadata
router.put('/:id', async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ error: 'Nicht autorisiert' });

  try {
    const presResult = await db.query<PresentationRow>(
      'SELECT * FROM collaborative_presentations WHERE id = $1',
      [id]
    );
    const presentation = presResult[0];
    if (!presentation) return res.status(404).json({ error: 'Nicht gefunden' });
    if (!hasAccess(presentation, userId, 'editor')) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }

    const { title, language, theme, template } = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (title !== undefined) {
      updates.push(`title = $${idx++}`);
      values.push(title);
    }
    if (language !== undefined) {
      updates.push(`language = $${idx++}`);
      values.push(language);
    }
    if (theme !== undefined) {
      updates.push(`theme = $${idx++}`);
      values.push(JSON.stringify(theme));
    }
    if (template !== undefined) {
      updates.push(`template = $${idx++}`);
      values.push(template);
    }

    if (updates.length === 0) return res.json(presentationToCamelCase(presentation));

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await db.query(
      `UPDATE collaborative_presentations SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    );

    res.json({ success: true });
  } catch (err) {
    log.error('Failed to update presentation', err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren' });
  }
});

// DELETE /api/presentations/:id — Delete presentation
router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ error: 'Nicht autorisiert' });

  try {
    const presResult = await db.query<PresentationRow>(
      'SELECT * FROM collaborative_presentations WHERE id = $1',
      [id]
    );
    const presentation = presResult[0];
    if (!presentation) return res.status(404).json({ error: 'Nicht gefunden' });
    if (presentation.user_id !== userId) {
      return res.status(403).json({ error: 'Nur Eigentümer*innen können löschen' });
    }

    await db.query('DELETE FROM collaborative_presentations WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    log.error('Failed to delete presentation', err);
    res.status(500).json({ error: 'Fehler beim Löschen' });
  }
});

// POST /api/presentations/:id/slides — Add a slide
router.post('/:id/slides', async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ error: 'Nicht autorisiert' });

  try {
    const presResult = await db.query<PresentationRow>(
      'SELECT * FROM collaborative_presentations WHERE id = $1',
      [id]
    );
    const presentation = presResult[0];
    if (!presentation) return res.status(404).json({ error: 'Nicht gefunden' });
    if (!hasAccess(presentation, userId, 'editor')) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }

    const { afterIndex, layoutGroup, layout, content, speakerNote, properties } = req.body;

    // Shift existing slides
    await db.query(
      'UPDATE presentation_slides SET index = index + 1 WHERE presentation_id = $1 AND index > $2',
      [id, afterIndex ?? -1]
    );

    const result = await db.query<SlideRow>(
      `INSERT INTO presentation_slides (presentation_id, index, layout_group, layout, content, speaker_note, properties)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        id,
        (afterIndex ?? -1) + 1,
        layoutGroup || 'general',
        layout || 'general:general-intro-slide',
        JSON.stringify(content || {}),
        speakerNote || null,
        JSON.stringify(properties || {}),
      ]
    );

    res.status(201).json(toCamelCase(result[0]!));
  } catch (err) {
    log.error('Failed to add slide', err);
    res.status(500).json({ error: 'Fehler beim Hinzufügen der Folie' });
  }
});

// DELETE /api/presentations/:id/slides/:slideId — Delete a slide
router.delete(
  '/:id/slides/:slideId',
  async (req: Request<{ id: string; slideId: string }>, res: Response) => {
    const userId = req.user?.id;
    const { id, slideId } = req.params;
    if (!userId) return res.status(401).json({ error: 'Nicht autorisiert' });

    try {
      const presResult = await db.query<PresentationRow>(
        'SELECT * FROM collaborative_presentations WHERE id = $1',
        [id]
      );
      const presentation = presResult[0];
      if (!presentation) return res.status(404).json({ error: 'Nicht gefunden' });
      if (!hasAccess(presentation, userId, 'editor')) {
        return res.status(403).json({ error: 'Keine Berechtigung' });
      }

      await db.query('DELETE FROM presentation_slides WHERE id = $1 AND presentation_id = $2', [
        slideId,
        id,
      ]);

      // Reindex remaining slides
      await db.query(
        `UPDATE presentation_slides
       SET index = sub.new_index
       FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY index) - 1 AS new_index
             FROM presentation_slides WHERE presentation_id = $1) sub
       WHERE presentation_slides.id = sub.id`,
        [id]
      );

      res.json({ success: true });
    } catch (err) {
      log.error('Failed to delete slide', err);
      res.status(500).json({ error: 'Fehler beim Löschen der Folie' });
    }
  }
);

// PUT /api/presentations/:id/slides/reorder — Reorder slides
router.put('/:id/slides/reorder', async (req: Request<{ id: string }>, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ error: 'Nicht autorisiert' });

  try {
    const presResult = await db.query<PresentationRow>(
      'SELECT * FROM collaborative_presentations WHERE id = $1',
      [id]
    );
    const presentation = presResult[0];
    if (!presentation) return res.status(404).json({ error: 'Nicht gefunden' });
    if (!hasAccess(presentation, userId, 'editor')) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }

    const { slideIds } = req.body as { slideIds: string[] };
    if (!Array.isArray(slideIds)) {
      return res.status(400).json({ error: 'slideIds muss ein Array sein' });
    }

    for (let i = 0; i < slideIds.length; i++) {
      await db.query(
        'UPDATE presentation_slides SET index = $1 WHERE id = $2 AND presentation_id = $3',
        [i, slideIds[i], id]
      );
    }

    res.json({ success: true });
  } catch (err) {
    log.error('Failed to reorder slides', err);
    res.status(500).json({ error: 'Fehler beim Sortieren' });
  }
});

// POST /api/presentations/generate — AI-generate a full presentation
router.post('/generate', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Nicht autorisiert' });

  const {
    content,
    tone = 'professional',
    verbosity = 'standard',
    nSlides = 8,
    language = 'Deutsch',
    instructions = null,
    includeTitleSlide = true,
    includeTableOfContents = false,
  } = req.body;

  console.log('[slides-gen] POST /generate request body:', {
    content: typeof content === 'string' ? content.slice(0, 200) : content,
    contentType: typeof content,
    tone,
    verbosity,
    nSlides,
    language,
    instructions,
    includeTitleSlide,
    includeTableOfContents,
  });

  if (!content || typeof content !== 'string') {
    console.error('[slides-gen] POST /generate rejected: content is missing or not a string', {
      content,
      contentType: typeof content,
    });
    return res.status(400).json({ error: 'content ist erforderlich' });
  }

  try {
    const result = await runSlidesGraph({
      options: {
        content,
        tone,
        verbosity,
        nSlides,
        language,
        instructions,
        includeTitleSlide,
        includeTableOfContents,
      },
    });

    if (!result.success || result.slides.length === 0) {
      log.error('SlidesGraph failed', { error: result.error, metadata: result.metadata });
      return res.status(500).json({ error: result.error || 'Fehler bei der KI-Generierung' });
    }

    const generated = { title: result.title, slides: result.slides };

    // Create presentation in DB
    const permissions: PresentationPermissions = {
      [userId]: { level: 'owner', granted_at: new Date().toISOString() },
    };

    const presResult = (await db.query<PresentationRow>(
      `INSERT INTO collaborative_presentations (title, user_id, language, permissions)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [generated.title, userId, language, JSON.stringify(permissions)]
    )) as PresentationRow[];

    const presentation = presResult[0]!;

    console.log('[slides-graph] Storing presentation:', {
      title: generated.title,
      slideCount: generated.slides.length,
      layouts: generated.slides.map((s) => s.layout),
      presentationId: presentation.id,
      ...result.metadata,
    });

    // Insert slides
    for (let i = 0; i < generated.slides.length; i++) {
      const slide = generated.slides[i]!;
      await db.query(
        `INSERT INTO presentation_slides (presentation_id, index, layout_group, layout, content, speaker_note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          presentation.id,
          i,
          slide.layoutGroup,
          slide.layout,
          JSON.stringify(slide.content),
          slide.speakerNote,
        ]
      );
    }

    res.status(201).json({
      presentationId: presentation.id,
      editPath: `/presentation/${presentation.id}`,
    });
  } catch (err) {
    log.error('Failed to generate presentation', err);
    res.status(500).json({ error: 'Fehler bei der KI-Generierung' });
  }
});

// GET /api/presentations/:id/export/:format — Export presentation as PPTX/PDF
// TODO: Replace with pptxgenjs rendering (Presenton service removed)
router.get(
  '/:id/export/:format',
  async (req: Request<{ id: string; format: string }>, res: Response) => {
    const userId = req.user?.id;
    const { id, format } = req.params;
    if (!userId) return res.status(401).json({ error: 'Nicht autorisiert' });

    if (format !== 'pptx' && format !== 'pdf') {
      return res.status(400).json({ error: 'Format muss pptx oder pdf sein' });
    }

    // Check access
    try {
      const presResult = await db.query<PresentationRow>(
        'SELECT * FROM collaborative_presentations WHERE id = $1',
        [id]
      );
      const presentation = presResult[0];
      if (!presentation) return res.status(404).json({ error: 'Nicht gefunden' });
      if (!hasAccess(presentation, userId)) {
        return res.status(403).json({ error: 'Kein Zugriff' });
      }
    } catch (err) {
      log.error('Failed to check presentation access for export', err);
      return res.status(500).json({ error: 'Fehler beim Export' });
    }

    res.status(501).json({
      error:
        'Export ist derzeit nicht verfügbar. PPTX/PDF-Export wird in Kürze wieder bereitgestellt.',
    });
  }
);

export default router;
