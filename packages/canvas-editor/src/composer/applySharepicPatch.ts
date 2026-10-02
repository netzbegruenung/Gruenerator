import {
  type SharepicItem,
  type SharepicPatchOp,
  type SharepicSpec,
  sharepicSpecSchema,
} from '@gruenerator/contracts';

export interface PatchResult {
  spec: SharepicSpec;
  /** Ops that did not fit the spec (wrong item, wrong type) — kept for the UI. */
  skipped: SharepicPatchOp[];
}

function withText(item: SharepicItem, text: string): SharepicItem | null {
  switch (item.type) {
    case 'dachzeile':
    case 'text':
    case 'zitat':
    case 'button':
      return { ...item, text };
    case 'liste':
      return {
        ...item,
        items: text
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      };
    case 'headline':
      return {
        type: 'headline',
        lines: text
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      };
  }
}

/**
 * Applies the review's patch to a spec. Index-addressed ops all refer to the
 * spec as the review saw it, so removals run last, from the back. A patched
 * spec that no longer validates is discarded whole — the draft stays as it was.
 */
export function applySharepicPatch(spec: SharepicSpec, ops: SharepicPatchOp[]): PatchResult {
  const skipped: SharepicPatchOp[] = [];
  const next: SharepicSpec = { ...spec, items: [...spec.items] };
  const removals = new Set<number>();

  for (const op of ops) {
    switch (op.op) {
      case 'set_text': {
        const item = next.items[op.item];
        const changed = item && withText(item, op.text);
        if (changed) next.items[op.item] = changed;
        else skipped.push(op);
        break;
      }
      case 'set_headline': {
        const index = next.items.findIndex((i) => i.type === 'headline');
        if (index === -1) skipped.push(op);
        else
          next.items[index] = {
            type: 'headline',
            lines: op.lines,
            ...(op.akzent !== undefined ? { akzent: op.akzent } : {}),
          };
        break;
      }
      case 'remove_item':
        if (next.items[op.item]) removals.add(op.item);
        else skipped.push(op);
        break;
      case 'set_position':
        next.position = op.position;
        break;
      case 'set_align':
        next.align = op.align;
        break;
      case 'set_text_side':
        if (next.background.kind === 'foto')
          next.background = { ...next.background, textSeite: op.textSeite };
        else skipped.push(op);
        break;
      case 'set_color':
        if (next.background.kind === 'farbe')
          next.background = { ...next.background, color: op.color };
        else if (next.background.kind === 'foto-oben')
          next.background = { ...next.background, panelColor: op.color };
        else skipped.push(op);
        break;
      case 'use_color':
        next.background = { kind: 'farbe', color: op.color };
        break;
      case 'remove_extra':
        if (op.extra === 'logo' || op.extra === 'pfeil') next[op.extra] = false;
        else delete next[op.extra];
        break;
    }
  }
  next.items = next.items.filter((_, index) => !removals.has(index));

  const parsed = sharepicSpecSchema.safeParse(next);
  if (!parsed.success) return { spec, skipped: ops };
  // A patch that changes nothing returns the same object, so callers can stop.
  if (JSON.stringify(parsed.data) === JSON.stringify(spec)) return { spec, skipped };
  return { spec: parsed.data, skipped };
}
