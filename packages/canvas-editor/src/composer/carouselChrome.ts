/**
 * Keeps a composed carousel's chrome true after page operations.
 *
 * The composer writes, per slide, what only makes sense in the deck: the page
 * number "k/n" (`sc-seite`) or a dot row (`sc-seite-0…n`), the swipe arrow
 * (`sc-pfeil`) with its teaser (`sc-weiter`) on every slide but the last, and
 * the point numerals (`sc-nummer`). Adding, removing, duplicating or moving a
 * page changes all of that, so after every such operation this rewrites the
 * elements that carry those ids — and nothing else. It is chrome: a page
 * number the user typed over is overwritten too.
 *
 * The chrome is owned by the deck, not the page: an arrow deleted by hand
 * from a middle slide comes back with the next page op.
 *
 * Pages added from a slide ("Seite hinzufügen") carry only its background, so
 * they get no page number or dots of their own; the other pages still count
 * them.
 *
 * Each collection is one value in the page's Y.Map, so a page op that lands
 * while someone types on another page of the same deck is last-write-wins
 * per key (e.g. `additionalTexts`): one of the two writes is lost.
 *
 * Pure apart from `refreshCarouselChromeInDoc`, which applies the result to
 * the pages document inside the caller's transaction.
 */
import { type SharepicColor, type SharepicCreatorLocale } from '@gruenerator/contracts';
import { type Doc } from 'yjs';

import { readPages, updatePageStateById } from '../collab/pagesDoc';

import {
  BRUSH_ARROW,
  defaultMeasure,
  inkOn,
  pageDots,
  SHAREPIC_COLOR_HEX,
  type MeasureText,
} from './chromeParts';

import type { IconState } from '../configs/factory/baseTypes';
import type { AdditionalText } from '../configs/types';
import type { AssetInstance } from '../utils/canvasAssets';
import type { ShapeInstance } from '../utils/shapes';

export interface ChromePage {
  configId: string;
  state: Record<string, unknown>;
}

const LOCALE: Record<string, SharepicCreatorLocale> = {
  freeform: 'de-DE',
  'freeform-at': 'de-AT',
};
const DOT_ID = /^sc-seite-\d+$/;
const ARROW = 'sc-pfeil';
const TEASER = 'sc-weiter';

// Page state is untyped at this boundary; the composer wrote these shapes.
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const record = <T>(value: unknown): Record<string, T> =>
  value && typeof value === 'object' ? (value as Record<string, T>) : {};

const colorOf = (hex: unknown): SharepicColor | null => {
  if (typeof hex !== 'string') return null;
  const match = Object.entries(SHAREPIC_COLOR_HEX).find(
    ([, value]) => value.toLowerCase() === hex.toLowerCase()
  );
  return match ? (match[0] as SharepicColor) : null;
};

/**
 * What the footer (arrow corner) sits on, read back from the page the way
 * the composer built it: a panel starting at the top is `foto-unten` (footer
 * on the photo), one further down is `foto-oben` (footer on the panel).
 * An unknown colour counts as dark ground.
 */
function footerSurface(state: Record<string, unknown>): SharepicColor | 'foto' {
  const panel = list<ShapeInstance>(state.shapeInstances).find((s) => s.id === 'sc-panel');
  if (panel) {
    return panel.y - panel.height / 2 <= 0 ? 'foto' : (colorOf(panel.fill) ?? 'foto');
  }
  if (state.backgroundMode === 'image') return 'foto';
  return colorOf(state.backgroundColor) ?? 'foto';
}

type ArrowTemplate = { kind: 'icon'; state: IconState } | { kind: 'asset'; asset: AssetInstance };

function arrowOf(state: Record<string, unknown>): ArrowTemplate | null {
  const icon = record<IconState>(state.iconStates)[ARROW];
  if (icon && list<string>(state.selectedIcons).includes(ARROW)) {
    return { kind: 'icon', state: icon };
  }
  const asset = list<AssetInstance>(state.assetInstances).find((a) => a.id === ARROW);
  return asset ? { kind: 'asset', asset } : null;
}

/**
 * The arrow for a page that has none: the position of the deck's other
 * arrows (same format, same locale, so the composer put them all at one
 * spot), in this page's footer ink.
 */
function arrowFor(
  template: ArrowTemplate,
  state: Record<string, unknown>,
  locale: SharepicCreatorLocale
): ArrowTemplate {
  const { onLight, darkInk } = inkOn(footerSurface(state), locale);
  if (template.kind === 'asset') {
    return {
      kind: 'asset',
      asset: { ...template.asset, assetId: onLight ? BRUSH_ARROW.onLight : BRUSH_ARROW.onDark },
    };
  }
  return {
    kind: 'icon',
    state: { ...template.state, color: darkInk ? SHAREPIC_COLOR_HEX.dunkeltanne : '#FFFFFF' },
  };
}

/** Replaces the run of `isOld` ids in `order` with `fresh`, where the first old one stood. */
function replaceIds(order: string[], isOld: (id: string) => boolean, fresh: string[]): string[] {
  const at = order.findIndex(isOld);
  const kept = order.filter((id) => !isOld(id));
  if (at < 0) return [...kept, ...fresh];
  const before = order.slice(0, at).filter((id) => !isOld(id)).length;
  return [...kept.slice(0, before), ...fresh, ...kept.slice(before)];
}

/**
 * The state keys to change on each page so its chrome matches its place in
 * the deck; `null` where nothing changes. Only `freeform`/`freeform-at` pages
 * are touched; every page counts towards "n".
 */
export function refreshCarouselChrome(
  pages: ChromePage[],
  measure: MeasureText = defaultMeasure
): (Record<string, unknown> | null)[] {
  const count = pages.length;
  // Before anything moves: the deck has arrows if any page still carries one.
  const templates = new Map<string, ArrowTemplate>();
  for (const page of pages) {
    const arrow = LOCALE[page.configId] ? arrowOf(page.state) : null;
    if (arrow && !templates.has(page.configId)) templates.set(page.configId, arrow);
  }
  // Points count only the slides that carry a numeral, as the composer counts them.
  let numeral = 0;

  return pages.map((page, index) => {
    const locale = LOCALE[page.configId];
    if (!locale) return null;
    const state = page.state;
    const isLast = index === count - 1;

    let texts = list<AdditionalText>(state.additionalTexts).map((t) => {
      if (t.id === 'sc-seite') {
        const text = `${index + 1}/${count}`;
        const width = measure(text, t.fontSize, t.fontFamily, t.fontStyle ?? 'bold') + 8;
        // Right-aligned in the corner: the right edge stays put.
        const x = t.align === 'right' ? t.x + t.width - width : t.x;
        return { ...t, text, width, x };
      }
      if (t.id === 'sc-nummer') {
        numeral++;
        return { ...t, text: t.text.trim().endsWith('.') ? `${numeral}.` : `${numeral}` };
      }
      return t;
    });
    let shapes = list<ShapeInstance>(state.shapeInstances);
    let assets = list<AssetInstance>(state.assetInstances);
    let icons = list<string>(state.selectedIcons);
    let iconStates = record<IconState>(state.iconStates);
    let order = list<string>(state.layerOrder);

    const dots = shapes.filter((s) => DOT_ID.test(s.id));
    if (dots.length > 0) {
      const xs = dots.map((d) => d.x);
      const first = dots[0]!;
      const fresh = pageDots(
        count,
        index,
        (Math.min(...xs) + Math.max(...xs)) / 2,
        first.y - first.height / 2,
        first.fill
      );
      const at = shapes.findIndex((s) => DOT_ID.test(s.id));
      const kept = shapes.filter((s) => !DOT_ID.test(s.id));
      shapes = [...kept.slice(0, at), ...fresh, ...kept.slice(at)];
      order = replaceIds(
        order,
        (id) => DOT_ID.test(id),
        fresh.map((d) => d.id)
      );
    }

    const hasArrow = arrowOf(state) !== null;
    const template = templates.get(page.configId);
    const composed = order.some((id) => id.startsWith('sc-'));
    if (isLast && hasArrow) {
      const chrome = (id: string) => id === ARROW || id === TEASER;
      texts = texts.filter((t) => !chrome(t.id));
      assets = assets.filter((a) => a.id !== ARROW);
      icons = icons.filter((id) => id !== ARROW);
      iconStates = Object.fromEntries(Object.entries(iconStates).filter(([id]) => id !== ARROW));
      order = order.filter((id) => !chrome(id));
    } else if (!isLast && !hasArrow && template && composed) {
      const arrow = arrowFor(template, state, locale);
      if (arrow.kind === 'asset') {
        assets = [...assets, arrow.asset];
      } else {
        icons = [...icons, ARROW];
        iconStates = { ...iconStates, [ARROW]: arrow.state };
      }
      order = [...order, ARROW];
    }

    const next: Record<string, unknown> = {
      additionalTexts: texts,
      shapeInstances: shapes,
      assetInstances: assets,
      selectedIcons: icons,
      iconStates,
      layerOrder: order,
    };
    const changed = Object.fromEntries(
      Object.entries(next).filter(
        ([key, value]) =>
          JSON.stringify(value) !== JSON.stringify(state[key] ?? (key === 'iconStates' ? {} : []))
      )
    );
    return Object.keys(changed).length > 0 ? changed : null;
  });
}

/**
 * Applies `refreshCarouselChrome` to every page of the document. Call it
 * inside the transaction of the page operation, so undo and peers see one
 * change.
 */
export function refreshCarouselChromeInDoc(doc: Doc): void {
  const views = readPages(doc);
  refreshCarouselChrome(views).forEach((partial, i) => {
    if (partial) updatePageStateById(doc, views[i]!.id, partial);
  });
}
