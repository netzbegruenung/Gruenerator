import { type Flux3Bbox, type Flux3BoxEdit, type Flux3EditRow } from '@gruenerator/contracts';

import { type BevBox } from './types';

/** Grid step for keyboard nudging (1 % of the frame). */
export const BOX_STEP = 10;
/** Same floor the server enforces for boxes the model has to fill. */
export const MIN_BOX_EDGE = 30;

const sameBox = (a: Flux3Bbox, b: Flux3Bbox) => a.every((v, i) => v === b[i]);

export function isMoved(box: BevBox): boolean {
  return box.source !== null && !sameBox(box.source, box.bbox);
}

/** A new element counts once it says what should appear. */
export function isChanged(box: BevBox): boolean {
  if (box.source === null) return box.change.trim() !== '';
  return box.action !== 'keep' || isMoved(box);
}

export function boxName(box: BevBox): string {
  return box.label || box.desc || box.change || 'Neues Element';
}

/** Every box's name, numbered where detection found the same thing twice („Sonnenschirm 2"). */
export function boxNames(boxes: readonly BevBox[]): Map<string, string> {
  const total = new Map<string, number>();
  for (const box of boxes) total.set(boxName(box), (total.get(boxName(box)) ?? 0) + 1);
  const seen = new Map<string, number>();
  return new Map(
    boxes.map((box) => {
      const name = boxName(box);
      if ((total.get(name) ?? 0) < 2) return [box.id, name];
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      return [box.id, `${name} ${n}`];
    })
  );
}

/** The box changes in words, for the chat and the version: „E-Scooter → ein Lastenrad". */
export function boxSummary(boxes: readonly BevBox[]): string {
  const names = boxNames(boxes);
  return boxes
    .filter(isChanged)
    .map((box) => {
      const name = names.get(box.id) ?? boxName(box);
      if (box.source === null) return `Neu: ${box.change.trim()}`;
      if (box.action === 'remove') return `${name} entfernen`;
      if (box.action === 'change') return `${name} → ${box.change.trim()}`;
      return `${name} verschieben`;
    })
    .join('; ');
}

/** Clamp a box into the grid and keep its minimum size. */
export function clampBox([top, left, bottom, right]: Flux3Bbox): Flux3Bbox {
  const h = Math.max(MIN_BOX_EDGE, Math.min(1000, bottom - top));
  const w = Math.max(MIN_BOX_EDGE, Math.min(1000, right - left));
  const t = Math.round(Math.min(Math.max(0, top), 1000 - h));
  const l = Math.round(Math.min(Math.max(0, left), 1000 - w));
  return [t, l, Math.round(t + h), Math.round(l + w)];
}

export function moveBox(box: Flux3Bbox, dy: number, dx: number): Flux3Bbox {
  return clampBox([box[0] + dy, box[1] + dx, box[2] + dy, box[3] + dx]);
}

export function resizeBox(box: Flux3Bbox, dy: number, dx: number): Flux3Bbox {
  return clampBox([box[0], box[1], box[2] + dy, box[3] + dx]);
}

/**
 * Rows and instruction for `/api/image-edit` with explicit boxes (FLUX 3).
 * Every change is named in the instruction as well as in the rows — BFL's
 * "say it twice": the instruction and the table should agree. Returns null
 * when nothing changed, so the caller can fall back to `boxes: 'auto'`.
 */
export function buildBoxEdit(boxes: BevBox[], userText: string): Flux3BoxEdit | null {
  const rows: Flux3EditRow[] = [];
  const parts: string[] = [];

  for (const box of boxes) {
    if (box.source === null && !isChanged(box)) continue;
    const after = box.change.trim() || box.desc;
    if (box.source === null) {
      rows.push({ id: box.id, from: null, src_bbox: null, tgt_bbox: box.bbox, desc: after });
      parts.push(`add <${box.id}>: ${after}`);
    } else if (box.action === 'remove') {
      // The current bbox, not the detected one: dragging a box marked for
      // removal corrects the area to erase.
      rows.push({
        id: box.id,
        from: 'ref_image_0',
        src_bbox: box.bbox,
        tgt_bbox: null,
        desc: box.desc,
      });
      parts.push(`remove <${box.id}> and fill the area with what was behind it`);
    } else if (box.action === 'change') {
      if (isMoved(box)) {
        const old = `${box.id}_old`;
        rows.push({
          id: old,
          from: 'ref_image_0',
          src_bbox: box.source,
          tgt_bbox: null,
          desc: box.desc,
        });
        parts.push(`remove <${old}>`);
      }
      rows.push({ id: box.id, from: null, src_bbox: null, tgt_bbox: box.bbox, desc: after });
      parts.push(`change <${box.id}> to: ${after}`);
    } else {
      rows.push({
        id: box.id,
        from: 'ref_image_0',
        src_bbox: box.source,
        tgt_bbox: box.bbox,
        desc: box.desc,
      });
      if (isMoved(box)) parts.push(`move <${box.id}> to its new position`);
    }
  }

  if (parts.length === 0) return null;
  const instruction = [
    userText.trim(),
    `In <ref_image_0>, ${parts.join('; ')}. Keep everything else exactly unchanged.`,
  ]
    .filter(Boolean)
    .join(' ');
  return { instruction, rows };
}

/** Next free id for a box the user adds. */
export function newBoxId(boxes: BevBox[]): string {
  let n = 1;
  while (boxes.some((b) => b.id === `neu_${n}`)) n++;
  return `neu_${n}`;
}
