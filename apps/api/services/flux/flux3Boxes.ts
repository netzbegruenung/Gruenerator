/**
 * Validation and wire format for FLUX 3 bounding boxes.
 *
 * BFL has no box field: rows go into `prompt` as `<text> <JSON array>`, and the
 * endpoint does not check them. A malformed row therefore does not fail — the
 * element silently goes missing or lands elsewhere. These checks are the gate
 * the API does not have, and the error strings double as the repair message
 * `aiObject` quotes back to the model.
 */
import {
  flux3BoxEditSchema,
  flux3DetectedElementSchema,
  flux3LayoutSchema,
  type Flux3Bbox,
  type Flux3BoxEdit,
  type Flux3DetectedElement,
  type Flux3EditRow,
  type Flux3Layout,
} from '@gruenerator/contracts';
import { z } from 'zod';

import type { StructuredValidation } from '../ai/structuredParsing.js';

/**
 * Smallest edge, in grid units, for a box the model has to fill. BFL measured
 * a new element in a ~40 × 25 px box often not appearing; on their ~1400 px
 * examples that is ~30 × 18 units. Boxes that only keep what is there
 * (detection results, anchors) may be smaller.
 */
export const MIN_GENERATED_EDGE = 30;

const TOKEN = /<([A-Za-z][A-Za-z0-9_]*)>/g;

function tokensIn(text: string): Set<string> {
  return new Set([...text.matchAll(TOKEN)].map((m) => m[1]));
}

function bboxProblem(id: string, bbox: Flux3Bbox, minEdge: number): string | null {
  const [top, left, bottom, right] = bbox;
  if (top >= bottom || left >= right) {
    return `${id}: box must be [top, left, bottom, right] with top < bottom and left < right`;
  }
  if (bottom - top < minEdge || right - left < minEdge) {
    return `${id}: box is smaller than ${minEdge} grid units on one side — the element would not appear`;
  }
  return null;
}

function duplicateId(ids: string[]): string | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
}

function issuesOf(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export function validateLayout(input: unknown): StructuredValidation<Flux3Layout> {
  const parsed = flux3LayoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issuesOf(parsed.error) };
  const layout = parsed.data;

  const dup = duplicateId(layout.rows.map((r) => r.id));
  if (dup) return { ok: false, error: `id ${dup} is used twice` };

  const tokens = tokensIn(layout.caption);
  const ids = new Set(layout.rows.map((r) => r.id));
  const unlisted = [...tokens].filter((t) => !ids.has(t));
  if (unlisted.length) {
    return { ok: false, error: `caption names <${unlisted.join('>, <')}> without a row` };
  }
  const unnamed = [...ids].filter((id) => !tokens.has(id));
  if (unnamed.length) {
    return { ok: false, error: `rows ${unnamed.join(', ')} are not named as <id> in the caption` };
  }

  for (const row of layout.rows) {
    const problem = bboxProblem(row.id, row.bbox, MIN_GENERATED_EDGE);
    if (problem) return { ok: false, error: problem };
  }
  return { ok: true, value: layout };
}

const detectedElementsSchema = z.object({
  elements: z.array(flux3DetectedElementSchema).min(1).max(40),
});

/** Detection reports what is there, so small boxes are fine — only shape and ids are checked. */
export function validateElements(input: unknown): StructuredValidation<Flux3DetectedElement[]> {
  const parsed = detectedElementsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issuesOf(parsed.error) };
  const { elements } = parsed.data;

  const dup = duplicateId(elements.map((e) => e.id));
  if (dup) return { ok: false, error: `id ${dup} is used twice` };
  for (const element of elements) {
    const problem = bboxProblem(element.id, element.bbox, 1);
    if (problem) return { ok: false, error: problem };
  }
  return { ok: true, value: elements };
}

export type EditRowKind = 'keep' | 'move' | 'new' | 'remove';

export function editRowKind(row: Flux3EditRow): EditRowKind | null {
  if (row.from === null) return row.src_bbox === null && row.tgt_bbox !== null ? 'new' : null;
  if (row.src_bbox === null) return null;
  if (row.tgt_bbox === null) return 'remove';
  return row.src_bbox.every((v, i) => v === row.tgt_bbox?.[i]) ? 'keep' : 'move';
}

export function validateBoxEdit(input: unknown): StructuredValidation<Flux3BoxEdit> {
  const parsed = flux3BoxEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issuesOf(parsed.error) };
  const edit = parsed.data;

  const dup = duplicateId(edit.rows.map((r) => r.id));
  if (dup) return { ok: false, error: `id ${dup} is used twice` };

  const ids = new Set(edit.rows.map((r) => r.id));
  const unlisted = [...tokensIn(edit.instruction)].filter(
    (t) => t !== 'ref_image_0' && !ids.has(t)
  );
  if (unlisted.length) {
    return { ok: false, error: `instruction names <${unlisted.join('>, <')}> without a row` };
  }

  let changes = 0;
  for (const row of edit.rows) {
    const kind = editRowKind(row);
    if (!kind) {
      return {
        ok: false,
        error: `${row.id}: inconsistent row — new needs from=null, src_bbox=null and a tgt_bbox; keep/move/remove need from="ref_image_0" and a src_bbox`,
      };
    }
    if (kind !== 'keep') changes++;
    for (const [box, minEdge] of [
      [row.src_bbox, 1],
      [row.tgt_bbox, kind === 'keep' ? 1 : MIN_GENERATED_EDGE],
    ] as const) {
      const problem = box && bboxProblem(row.id, box, minEdge);
      if (problem) return { ok: false, error: problem };
    }
  }
  if (changes === 0) return { ok: false, error: 'no row changes anything — every row is a keep' };
  return { ok: true, value: edit };
}

/** Caption first, then a space, then the rows — BFL's documented wire format. */
export function serializeLayout(layout: Flux3Layout): string {
  return `${layout.caption} ${JSON.stringify(layout.rows.map(({ id, bbox, desc }) => ({ id, bbox, desc })))}`;
}

export function serializeBoxEdit(edit: Flux3BoxEdit): string {
  const rows = edit.rows.map(({ id, from, src_bbox, tgt_bbox, desc }) => ({
    id,
    from,
    src_bbox,
    tgt_bbox,
    desc,
  }));
  return `${edit.instruction} ${JSON.stringify(rows)}`;
}
