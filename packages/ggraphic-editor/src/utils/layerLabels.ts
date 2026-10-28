// SPDX-License-Identifier: MPL-2.0
/**
 * Namen der Elemente einer Seite, wie Screenreader und die Ebenen-Liste sie
 * nennen: deutsche Art plus Inhalt („Text: Klimaschutz“, „Form: Kreis“,
 * „Hintergrund“), gesperrte mit „, gesperrt“. Rein — kein React, kein Store —,
 * damit Bühnen-Beschriftung, Alt-Text und Ansagen dieselben Namen lesen.
 */

import { messages } from '@ggraphic/editor/i18n/messages';
import { getShapeDef } from '@ggraphic/editor/utils/shapes';

import { getAssetById, isStickerLikeInstance } from './canvasAssets.js';
import { isLayerLocked } from './layerLock.js';
import { BACKGROUND_IMAGE_NODE_ID } from './printImageInfo.js';

import type { CanvasItem } from './canvasLayerManager.js';
import type { CanvasElementConfig } from '../configs/types.js';

/** Ein Eintrag der Ebenen-Liste. */
export interface LayerEntry {
  id: string;
  label: string;
}

/** So viele Zeichen Inhalt stehen höchstens im Namen, die Auslassung mitgezählt. */
export const LAYER_TEXT_MAX = 40;

/** Vorlagen-Bilder tragen ihre Rolle in der Id. */
function templateImageName(id: string): string | undefined {
  const m = messages().layers;
  switch (id) {
    case BACKGROUND_IMAGE_NODE_ID:
    case 'avatar':
      return m.photo;
    case 'sunflower':
      return m.sunflower;
    case 'logo':
      return m.logo;
    case 'quote-mark':
      return m.quoteMark;
    case 'arrow':
      return m.arrow;
    default:
      return undefined;
  }
}

/** Fließtext für den Namen: Markdown-lite weg, Leerraum zusammengezogen, gekürzt. */
function shorten(text: string): string {
  const flat = text
    .replace(/\*\*|<\/?u>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > LAYER_TEXT_MAX ? `${flat.slice(0, LAYER_TEXT_MAX - 1).trimEnd()}…` : flat;
}

function named(kind: string, content: string): string {
  const text = shorten(content);
  return text ? messages().layers.named(kind, text) : kind;
}

function imageSource(
  element: Extract<CanvasElementConfig, { type: 'image' }>,
  state: Record<string, unknown>
): string {
  if (element.srcKey) {
    const value = state[element.srcKey];
    return typeof value === 'string' ? value : '';
  }
  if (typeof element.src === 'function') return element.src(state);
  return element.src ?? '';
}

function elementLabel(element: CanvasElementConfig, state: Record<string, unknown>): string {
  switch (element.type) {
    case 'text': {
      const value = state[element.textKey];
      return named(messages().common.text, typeof value === 'string' ? value : '');
    }
    case 'image':
      return templateImageName(element.id) ?? messages().common.image;
    case 'background':
      return messages().layers.background;
    case 'rect':
      return messages().layers.area;
    case 'circle':
      return messages().layers.shapeCircle;
    case 'group':
      return messages().layers.group;
  }
}

function kindLabel(item: CanvasItem, state: Record<string, unknown>): string {
  switch (item.type) {
    case 'element':
      return elementLabel(item.data, state);
    case 'balken':
      return named(messages().layers.bar, item.data.texts.filter((t) => t.trim()).join(' / '));
    case 'icon':
      return messages().layers.icon;
    case 'shape':
      return messages().layers.shape(getShapeDef(item.data.type).name);
    case 'frame':
      return messages().layers.frame;
    case 'additional-text':
      return named(messages().common.text, item.data.text);
    case 'illustration':
      return messages().layers.illustration;
    case 'asset':
      return (
        getAssetById(item.data.assetId)?.label ??
        (isStickerLikeInstance(item.data) ? messages().layers.sticker : messages().layers.graphic)
      );
    case 'circle-badge':
      return named(
        messages().layers.badgeCircle,
        item.data.textLines.map((line) => line.text).join(' ')
      );
    case 'pill-badge':
      return named(messages().layers.badgePill, item.data.text);
    case 'user-image':
      return messages().common.image;
    case 'chart':
      return named(messages().layers.chart, item.data.title ?? '');
  }
}

/** Der Name eines Elements, mit „, gesperrt“, wenn es gesperrt ist. */
export function layerLabel(item: CanvasItem, state: Record<string, unknown>): string {
  const label = kindLabel(item, state);
  return isLayerLocked(state, item.id) ? messages().layers.locked(label) : label;
}

/**
 * Steht das Element auf der Fläche und lässt es sich anwählen? Ausgeblendete
 * Vorlagen-Elemente, Bilder ohne Quelle und reine Zierflächen (Rechteck,
 * Kreis, Gruppe, `listening: false`) zeichnet die Bühne nicht oder nimmt sie
 * nicht an — ein Eintrag dafür wählte nichts aus.
 */
export function isListedLayer(item: CanvasItem, state: Record<string, unknown>): boolean {
  if (item.type !== 'element') return true;
  const element = item.data;
  if (element.visible && !element.visible(state)) return false;
  switch (element.type) {
    case 'text':
    case 'background':
      return true;
    case 'image':
      return element.listening !== false && imageSource(element, state) !== '';
    case 'rect':
    case 'circle':
    case 'group':
      return false;
  }
}

/**
 * Die Einträge einer Seite in Ebenen-Reihenfolge, vorderstes zuerst.
 * `renderList` ist die Zeichenfolge der Bühne (hinten → vorn,
 * `buildSortedRenderList`).
 */
export function pageLayerLabels(
  renderList: readonly CanvasItem[],
  state: Record<string, unknown>
): LayerEntry[] {
  const entries: LayerEntry[] = [];
  for (let i = renderList.length - 1; i >= 0; i--) {
    const item = renderList[i]!;
    if (isListedLayer(item, state)) entries.push({ id: item.id, label: layerLabel(item, state) });
  }
  return entries;
}

/** So viele Zeichen hat die Bühnen-Beschriftung höchstens, bevor „und N weitere“ folgt. */
export const STAGE_SUMMARY_MAX = 200;

/**
 * Die Beschriftung der Bühne („Seite 1: Text: Klimaschutz, Sonnenblume“):
 * die Namen der Ebenen, vorderste zuerst, kurz gehalten — was darüber hinaus
 * geht, zählt „und N weitere“. `prefix` ist „Seite 1“ o. ä.
 */
export function stageSummary(entries: readonly LayerEntry[], prefix: string): string {
  if (entries.length === 0) return messages().layers.stageEmpty(prefix);
  let text = `${prefix}: `;
  let used = 0;
  for (const entry of entries) {
    const next = `${used > 0 ? ', ' : ''}${entry.label}`;
    if (used > 0 && text.length + next.length > STAGE_SUMMARY_MAX) break;
    text += next;
    used++;
  }
  const rest = entries.length - used;
  return rest > 0 ? messages().layers.stageMore(text, rest) : text;
}

/** Gleiche Einträge in gleicher Reihenfolge? */
export function sameLayerEntries(a: readonly LayerEntry[], b: readonly LayerEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every((entry, i) => entry.id === b[i]!.id && entry.label === b[i]!.label)
  );
}
