import {
  accentLines,
  isSharepicSceneRef,
  isSharepicUploadId,
  type SharepicItem,
  type SharepicPatchOp,
  type SharepicSlide,
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
    case 'absatz':
    case 'zitat':
    case 'frage':
    case 'button':
    case 'aufruf':
      return { ...item, text };
    // A chart's values come from the request, and the titles and points of a
    // comparison, a fact check or an infographic cannot be addressed through
    // one text: the review does not reword them.
    case 'diagramm':
    case 'vergleich':
    case 'faktencheck':
    case 'infografik':
    case 'zahl':
    case 'rechnung':
    case 'termine':
    case 'schlagzeile':
    case 'bingo':
      return null;
    case 'iconliste': {
      // One line per row, so every row keeps its icon.
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      return lines.length === item.zeilen.length
        ? { ...item, zeilen: item.zeilen.map((z, k) => ({ ...z, text: lines[k]! })) }
        : null;
    }
    case 'liste':
      return {
        ...item,
        items: text
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      };
    case 'headline': {
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      // Rewording keeps the emphasis on the lines that are still there —
      // `set_text` on a headline must not silently drop its accent.
      const kept = accentLines(item.akzent).filter((i) => i < lines.length);
      return {
        type: 'headline',
        lines,
        ...(kept.length ? { akzent: kept.length === 1 ? kept[0]! : kept } : {}),
      };
    }
  }
}

/**
 * Applies the review's patch to a spec. Index-addressed ops all refer to the
 * spec as the review saw it, so removals run last, from the back. A patched
 * spec that no longer validates is discarded whole — the draft stays as it was.
 */
export function applySharepicPatch(spec: SharepicSpec, ops: SharepicPatchOp[]): PatchResult {
  const skipped: SharepicPatchOp[] = [];
  const slides: SharepicSlide[] = spec.slides.map((slide) => ({
    ...slide,
    items: [...slide.items],
  }));
  const removals = slides.map(() => new Set<number>());

  for (const op of ops) {
    const index = op.slide ?? 0;
    // `.at()` instead of an index access: the slide number comes from the model.
    const next = index >= 0 ? slides.at(index) : undefined;
    if (!next) {
      skipped.push(op);
      continue;
    }
    switch (op.op) {
      case 'set_text': {
        const item = next.items[op.item];
        const changed = item && withText(item, op.text);
        if (changed) next.items[op.item] = changed;
        else skipped.push(op);
        break;
      }
      case 'set_headline': {
        const existing = next.items.findIndex((i) => i.type === 'headline');
        const at = op.item ?? existing;
        // A slide keeps one headline: turning an item into one needs a slide without.
        if (!next.items[at] || (existing !== -1 && existing !== at)) skipped.push(op);
        else {
          // A re-wrap keeps the size the person asked for.
          const old = next.items[at];
          const groesse = old?.type === 'headline' ? old.groesse : undefined;
          next.items[at] = {
            type: 'headline',
            lines: op.lines,
            ...(op.akzent !== undefined ? { akzent: op.akzent } : {}),
            ...(groesse ? { groesse } : {}),
          };
        }
        break;
      }
      case 'remove_item':
        if (next.items[op.item]) removals[index]!.add(op.item);
        else skipped.push(op);
        break;
      case 'set_position':
        next.position = op.position;
        break;
      case 'set_align':
        next.align = op.align;
        break;
      case 'set_text_side':
        // A painted scene keeps its calm area on one side only — the text stays there.
        if (next.background.kind === 'foto' && !isSharepicSceneRef(next.background.filename))
          next.background = { ...next.background, textSeite: op.textSeite };
        else skipped.push(op);
        break;
      case 'set_color':
        if (next.background.kind === 'farbe')
          next.background = { ...next.background, color: op.color };
        else if (next.background.kind === 'foto-oben' || next.background.kind === 'foto-unten')
          next.background = { ...next.background, panelColor: op.color };
        else skipped.push(op);
        break;
      case 'use_color':
        // The person brought this photo themselves, or paid trees for the painted scene —
        // a review never swaps it for a colour.
        if (
          next.background.kind !== 'farbe' &&
          (isSharepicUploadId(next.background.filename) ||
            isSharepicSceneRef(next.background.filename))
        )
          skipped.push(op);
        else next.background = { kind: 'farbe', color: op.color };
        break;
      case 'remove_extra':
        // Named per extra (no dynamic key) so a string can never reach a prototype slot.
        switch (op.extra) {
          case 'logo':
            next.logo = false;
            break;
          case 'stoerer':
            delete next.stoerer;
            break;
          case 'datum':
            delete next.datum;
            break;
          case 'ort':
            delete next.ort;
            break;
          case 'quelle':
            delete next.quelle;
            break;
        }
        break;
    }
  }
  slides.forEach((slide, s) => {
    slide.items = slide.items.filter((_, i) => !removals[s]!.has(i));
  });

  const parsed = sharepicSpecSchema.safeParse({ ...spec, slides });
  if (!parsed.success) return { spec, skipped: ops };
  // A patch that changes nothing returns the same object, so callers can stop.
  if (JSON.stringify(parsed.data) === JSON.stringify(spec)) return { spec, skipped };
  return { spec: parsed.data, skipped };
}
