import { describe, expect, it } from 'vitest';

import { selectionCapabilities } from './selectionCapabilities';

import type { CanvasItem } from './canvasLayerManager';

const renderList = [
  { id: 'headline', type: 'element', data: { id: 'headline', type: 'text', editable: true } },
  { id: 'claim', type: 'element', data: { id: 'claim', type: 'text' } },
  { id: 't-1', type: 'additional-text', data: { id: 't-1', text: 'Hallo' } },
  { id: 'u-1', type: 'user-image', data: { id: 'u-1' } },
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

  it('gilt nicht für feste Vorlagen-Texte, Bilder, Mehrfachauswahl und den Lesemodus', () => {
    expect(canEditText(['claim'])).toBe(false);
    expect(canEditText(['u-1'])).toBe(false);
    expect(canEditText(['t-1', 'headline'])).toBe(false);
    expect(canEditText(['t-1'], true)).toBe(false);
  });
});
