import { describe, expect, it } from 'vitest';

import {
  isListedLayer,
  layerLabel,
  pageLayerLabels,
  sameLayerEntries,
  stageSummary,
} from './layerLabels';

import type { CanvasItem } from './canvasLayerManager';
import type { CanvasElementConfig } from '../configs/types';

/** Nur die Felder, die die Namen lesen; der Rest der Instanzen spielt keine Rolle. */
const item = (value: unknown) => value as CanvasItem;
const element = (data: Record<string, unknown>) =>
  item({ id: data.id, type: 'element', data: data as unknown as CanvasElementConfig });

const state = { headline: 'Klimaschutz', currentImageSrc: 'foto.jpg' };

describe('layerLabel', () => {
  it.each<[string, CanvasItem, string]>([
    [
      'Vorlagen-Text',
      element({ id: 'headline', type: 'text', textKey: 'headline' }),
      'Text: Klimaschutz',
    ],
    ['leerer Vorlagen-Text', element({ id: 'sub', type: 'text', textKey: 'missing' }), 'Text'],
    ['Foto', element({ id: 'background-image', type: 'image', srcKey: 'currentImageSrc' }), 'Foto'],
    ['Sonnenblume', element({ id: 'sunflower', type: 'image', src: 's.svg' }), 'Sonnenblume'],
    ['anderes Vorlagen-Bild', element({ id: 'deko', type: 'image', src: 'd.svg' }), 'Bild'],
    ['Hintergrund', element({ id: 'background', type: 'background' }), 'Hintergrund'],
    ['Rechteck', element({ id: 'scrim', type: 'rect' }), 'Fläche'],
    ['Kreis', element({ id: 'dot', type: 'circle' }), 'Form: Kreis'],
    ['Gruppe', element({ id: 'g', type: 'group', children: [] }), 'Gruppe'],
    [
      'Balken',
      item({
        id: 'balken-1',
        type: 'balken',
        data: { texts: ['Klimaschutz', 'jetzt', 'handeln'] },
      }),
      'Balken: Klimaschutz / jetzt / handeln',
    ],
    ['Icon', item({ id: 'heart', type: 'icon' }), 'Icon'],
    ['Form', item({ id: 'shape-1', type: 'shape', data: { type: 'circle' } }), 'Form: Kreis'],
    ['Rahmen', item({ id: 'frame-1', type: 'frame', data: {} }), 'Rahmen'],
    [
      'eigener Text',
      item({ id: 't-1', type: 'additional-text', data: { text: '**Jetzt**\n<u>wählen</u>' } }),
      'Text: Jetzt wählen',
    ],
    ['Illustration', item({ id: 'ill-1', type: 'illustration', data: {} }), 'Illustration'],
    [
      'Grafik aus dem Katalog',
      item({ id: 'a-1', type: 'asset', data: { assetId: 'sunflower' } }),
      'Sonnenblume (Gelb)',
    ],
    [
      'Sticker',
      item({
        id: 'a-2',
        type: 'asset',
        data: { assetId: 'asset:1234', src: '/api/share/abcdef0123456789/download' },
      }),
      'Sticker',
    ],
    [
      'Störer',
      item({
        id: 'c-1',
        type: 'circle-badge',
        data: { textLines: [{ text: '12.' }, { text: 'Mai' }] },
      }),
      'Störer: 12. Mai',
    ],
    [
      'Badge',
      item({ id: 'p-1', type: 'pill-badge', data: { text: 'Wusstest du?' } }),
      'Badge: Wusstest du?',
    ],
    ['Bild', item({ id: 'u-1', type: 'user-image', data: {} }), 'Bild'],
    ['Diagramm', item({ id: 'chart-1', type: 'chart', data: { title: 'CO₂' } }), 'Diagramm: CO₂'],
    ['Diagramm ohne Titel', item({ id: 'chart-2', type: 'chart', data: {} }), 'Diagramm'],
  ])('%s', (_name, layer, expected) => {
    expect(layerLabel(layer, state)).toBe(expected);
  });

  it('kürzt Text auf 40 Zeichen', () => {
    const long = 'Wir schützen das Klima und investieren in Bus und Bahn';
    const label = layerLabel(item({ id: 't', type: 'additional-text', data: { text: long } }), {});
    expect(label).toBe('Text: Wir schützen das Klima und investieren…');
    expect(label.length - 'Text: '.length).toBeLessThanOrEqual(40);
  });

  it('hängt „, gesperrt“ an, wenn das Element gesperrt ist', () => {
    const shape = item({ id: 'shape-1', type: 'shape', data: { type: 'star' } });
    expect(layerLabel(shape, { lockedLayerIds: ['shape-1'] })).toBe('Form: Stern, gesperrt');
  });
});

describe('isListedLayer', () => {
  it('lässt aus, was die Bühne nicht zeichnet oder nicht annimmt', () => {
    expect(isListedLayer(element({ id: 'scrim', type: 'rect' }), state)).toBe(false);
    expect(
      isListedLayer(
        element({ id: 'x', type: 'text', textKey: 'headline', visible: () => false }),
        state
      )
    ).toBe(false);
    expect(
      isListedLayer(element({ id: 'background-image', type: 'image', srcKey: 'nothing' }), state)
    ).toBe(false);
    expect(
      isListedLayer(element({ id: 'logo', type: 'image', src: 'l.svg', listening: false }), state)
    ).toBe(false);
    expect(isListedLayer(element({ id: 'logo', type: 'image', src: 'l.svg' }), state)).toBe(true);
    expect(isListedLayer(item({ id: 'heart', type: 'icon' }), state)).toBe(true);
  });
});

describe('pageLayerLabels', () => {
  it('nennt die Elemente vorderstes zuerst', () => {
    const renderList = [
      element({ id: 'background', type: 'background' }),
      element({ id: 'scrim', type: 'rect' }),
      element({ id: 'headline', type: 'text', textKey: 'headline' }),
      item({ id: 'heart', type: 'icon' }),
    ];
    expect(pageLayerLabels(renderList, state)).toEqual([
      { id: 'heart', label: 'Icon' },
      { id: 'headline', label: 'Text: Klimaschutz' },
      { id: 'background', label: 'Hintergrund' },
    ]);
  });

  it('vergleicht Listen nach Id und Name', () => {
    const a = [{ id: 'x', label: 'Icon' }];
    expect(sameLayerEntries(a, [{ id: 'x', label: 'Icon' }])).toBe(true);
    expect(sameLayerEntries(a, [{ id: 'x', label: 'Icon, gesperrt' }])).toBe(false);
    expect(sameLayerEntries(a, [])).toBe(false);
  });
});

describe('stageSummary', () => {
  const entry = (label: string) => ({ id: label, label });

  it('nennt die Ebenen hinter dem Präfix', () => {
    expect(stageSummary([entry('Text: Klimaschutz'), entry('Sonnenblume')], 'Seite 1')).toBe(
      'Seite 1: Text: Klimaschutz, Sonnenblume'
    );
  });

  it('nennt eine leere Seite leer', () => {
    expect(stageSummary([], 'Seite 2')).toBe('Seite 2: leer');
  });

  it('kürzt auf rund 200 Zeichen und zählt den Rest', () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry(`Text: Eintrag ${i}`));
    const label = stageSummary(entries, 'Seite 1');
    expect(label).toMatch(/ und \d+ weitere$/);
    expect(label.length).toBeLessThan(230);
    expect(label.startsWith('Seite 1: Text: Eintrag 0, Text: Eintrag 1')).toBe(true);
  });
});
