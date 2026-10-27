// SPDX-License-Identifier: MPL-2.0
/**
 * Namen der Elemente einer Seite, wie Screenreader und die Ebenen-Liste sie
 * nennen: deutsche Art plus Inhalt („Text: Klimaschutz“, „Form: Kreis“,
 * „Hintergrund“), gesperrte mit „, gesperrt“. Rein — kein React, kein Store —,
 * damit Bühnen-Beschriftung, Alt-Text und Ansagen dieselben Namen lesen.
 */

import { getShapeDef } from '@ggraphic/editor/utils/shapes';

import { getAssetById, isStickerLikeInstance } from './canvasAssets';
import { isLayerLocked } from './layerLock';
import { BACKGROUND_IMAGE_NODE_ID } from './printImageInfo';

import type { CanvasItem } from './canvasLayerManager';
import type { CanvasElementConfig } from '../configs/types';

/** Ein Eintrag der Ebenen-Liste. */
export interface LayerEntry {
  id: string;
  label: string;
}

/** So viele Zeichen Inhalt stehen höchstens im Namen, die Auslassung mitgezählt. */
export const LAYER_TEXT_MAX = 40;

/** Vorlagen-Bilder tragen ihre Rolle in der Id. */
const TEMPLATE_IMAGE_NAMES: Readonly<Record<string, string>> = {
  [BACKGROUND_IMAGE_NODE_ID]: 'Foto',
  avatar: 'Foto',
  sunflower: 'Sonnenblume',
  logo: 'Logo',
  'quote-mark': 'Anführungszeichen',
  arrow: 'Pfeil',
};

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
  return text ? `${kind}: ${text}` : kind;
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
      return named('Text', typeof value === 'string' ? value : '');
    }
    case 'image':
      return TEMPLATE_IMAGE_NAMES[element.id] ?? 'Bild';
    case 'background':
      return 'Hintergrund';
    case 'rect':
      return 'Fläche';
    case 'circle':
      return 'Form: Kreis';
    case 'group':
      return 'Gruppe';
  }
}

function kindLabel(item: CanvasItem, state: Record<string, unknown>): string {
  switch (item.type) {
    case 'element':
      return elementLabel(item.data, state);
    case 'balken':
      return named('Balken', item.data.texts.filter((t) => t.trim()).join(' / '));
    case 'icon':
      return 'Icon';
    case 'shape':
      return `Form: ${getShapeDef(item.data.type).name}`;
    case 'frame':
      return 'Rahmen';
    case 'additional-text':
      return named('Text', item.data.text);
    case 'illustration':
      return 'Illustration';
    case 'asset':
      return (
        getAssetById(item.data.assetId)?.label ??
        (isStickerLikeInstance(item.data) ? 'Sticker' : 'Grafik')
      );
    case 'circle-badge':
      return named('Störer', item.data.textLines.map((line) => line.text).join(' '));
    case 'pill-badge':
      return named('Badge', item.data.text);
    case 'user-image':
      return 'Bild';
    case 'chart':
      return named('Diagramm', item.data.title ?? '');
  }
}

/** Der Name eines Elements, mit „, gesperrt“, wenn es gesperrt ist. */
export function layerLabel(item: CanvasItem, state: Record<string, unknown>): string {
  const label = kindLabel(item, state);
  return isLayerLocked(state, item.id) ? `${label}, gesperrt` : label;
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
  if (entries.length === 0) return `${prefix}: leer`;
  let text = `${prefix}: `;
  let used = 0;
  for (const entry of entries) {
    const next = `${used > 0 ? ', ' : ''}${entry.label}`;
    if (used > 0 && text.length + next.length > STAGE_SUMMARY_MAX) break;
    text += next;
    used++;
  }
  const rest = entries.length - used;
  return rest > 0 ? `${text} und ${rest} weitere` : text;
}

/** Gleiche Einträge in gleicher Reihenfolge? */
export function sameLayerEntries(a: readonly LayerEntry[], b: readonly LayerEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every((entry, i) => entry.id === b[i]!.id && entry.label === b[i]!.label)
  );
}
