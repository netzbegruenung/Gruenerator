import { selectionCapabilities } from '@ggraphic/editor/utils/selectionCapabilities';
import { describe, expect, it } from 'vitest';

import type { CanvasItem } from '@ggraphic/editor/utils/canvasLayerManager';

const renderList = [
  { id: 'headline', type: 'element', data: { id: 'headline', type: 'text', editable: true } },
  { id: 'claim', type: 'element', data: { id: 'claim', type: 'text' } },
  { id: 't-1', type: 'additional-text', data: { id: 't-1', text: 'Hallo' } },
  { id: 'u-1', type: 'user-image', data: { id: 'u-1' } },
  { id: 'b-1', type: 'balken', data: { id: 'b-1', texts: ['Klima'] } },
  { id: 'c-1', type: 'circle-badge', data: { id: 'c-1', textLines: [] } },
  { id: 'p-1', type: 'pill-badge', data: { id: 'p-1', text: 'Neu' } },
] as unknown as CanvasItem[];

const canEditText = (ids: string[], readOnly = false) =>
  selectionCapabilities({
    ids,
    state: {},
    actions: {},
    renderList,
    orient: () => null,
    readOnly,
  }).canEditText;

describe('canEditText', () => {
  it('gilt für einen eigenen Text und einen bearbeitbaren Vorlagen-Text', () => {
    expect(canEditText(['t-1'])).toBe(true);
    expect(canEditText(['headline'])).toBe(true);
  });

  it('gilt für Balken, Störer und Badge — ihre Zeilen öffnen über `textEditorOpeners`', () => {
    expect(canEditText(['b-1'])).toBe(true);
    expect(canEditText(['c-1'])).toBe(true);
    expect(canEditText(['p-1'])).toBe(true);
    expect(canEditText(['b-1'], true)).toBe(false);
  });

  it('gilt nicht für feste Vorlagen-Texte, Bilder, Mehrfachauswahl und den Lesemodus', () => {
    expect(canEditText(['claim'])).toBe(false);
    expect(canEditText(['u-1'])).toBe(false);
    expect(canEditText(['t-1', 'headline'])).toBe(false);
    expect(canEditText(['t-1'], true)).toBe(false);
  });
});
