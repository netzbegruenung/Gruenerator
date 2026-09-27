import { describe, expect, it } from 'vitest';

import {
  catalogIconId,
  iconInstanceIdsFor,
  recolorIconInstances,
  resolveIconDef,
  selectedCatalogIconIds,
} from './iconInstances';

import type { IconState } from '../configs/factory/baseTypes';

const at = (x: number, extra: Partial<IconState> = {}): IconState => ({
  x,
  y: x,
  scale: 1,
  rotation: 0,
  ...extra,
});

/**
 * Ein Dokument von VOR #3404: die Instanz-ID ist die Katalog-ID, kein `iconId`
 * weit und breit. Diese Form muss ohne Wanderung weiter funktionieren.
 */
const legacy = {
  selectedIcons: ['tabler-sun'],
  iconStates: { 'tabler-sun': at(10) },
};

/** Dasselbe Icon dreimal: das Original unter der Katalog-ID, zwei Kopien. */
const threeSuns = {
  selectedIcons: ['tabler-sun', 'icon-1', 'icon-2'],
  iconStates: {
    'tabler-sun': at(10),
    'icon-1': at(30, { iconId: 'tabler-sun' }),
    'icon-2': at(50, { iconId: 'tabler-sun' }),
  },
};

describe('catalogIconId', () => {
  it('nimmt die Instanz-ID, solange kein iconId danebensteht', () => {
    expect(catalogIconId('tabler-sun', legacy.iconStates)).toBe('tabler-sun');
  });

  it('löst eine Kopie auf ihr Katalog-Icon auf', () => {
    expect(catalogIconId('icon-1', threeSuns.iconStates)).toBe('tabler-sun');
  });

  it('fällt auf die ID zurück, wenn es gar keinen Zustand gibt', () => {
    expect(catalogIconId('tabler-sun', undefined)).toBe('tabler-sun');
  });
});

describe('selectedCatalogIconIds', () => {
  it('zählt drei Kopien als einen Eintrag der Seitenleiste', () => {
    expect(selectedCatalogIconIds(threeSuns.selectedIcons, threeSuns.iconStates)).toEqual([
      'tabler-sun',
    ]);
  });

  it('behält die Reihenfolge des ersten Auftretens', () => {
    const mixed = {
      selectedIcons: ['icon-1', 'tabler-leaf'],
      iconStates: { 'icon-1': at(1, { iconId: 'tabler-sun' }), 'tabler-leaf': at(2) },
    };
    expect(selectedCatalogIconIds(mixed.selectedIcons, mixed.iconStates)).toEqual([
      'tabler-sun',
      'tabler-leaf',
    ]);
  });
});

describe('iconInstanceIdsFor', () => {
  it('trifft mit der Katalog-ID das Original und jede Kopie', () => {
    expect(iconInstanceIdsFor('tabler-sun', threeSuns.selectedIcons, threeSuns.iconStates)).toEqual(
      ['tabler-sun', 'icon-1', 'icon-2']
    );
  });

  it('trifft mit einer Instanz-ID genau diese eine', () => {
    expect(iconInstanceIdsFor('icon-1', threeSuns.selectedIcons, threeSuns.iconStates)).toEqual([
      'icon-1',
    ]);
  });

  it('trifft nichts, was es nicht gibt', () => {
    expect(
      iconInstanceIdsFor('tabler-leaf', threeSuns.selectedIcons, threeSuns.iconStates)
    ).toEqual([]);
  });
});

describe('recolorIconInstances', () => {
  it('färbt jede Kopie, nicht nur das erste Exemplar', () => {
    const next = recolorIconInstances(threeSuns.iconStates, 'tabler-sun', '#FFFFFF');
    expect(Object.values(next).map((i) => i.color)).toEqual(['#FFFFFF', '#FFFFFF', '#FFFFFF']);
  });

  it('lässt fremde Icons in Ruhe und den alten Zustand unberührt', () => {
    const states = { 'tabler-sun': at(10), 'tabler-leaf': at(20, { color: '#005538' }) };
    const next = recolorIconInstances(states, 'tabler-sun', '#FFFFFF');
    expect(next['tabler-leaf'].color).toBe('#005538');
    expect(states['tabler-sun'].color).toBeUndefined();
  });
});

/**
 * Der Kern von #3404. Vorher schlug `CanvasRenderLayer` mit der Instanz-ID im
 * Katalog nach; eine Kopie fand nichts und zeichnete nichts.
 */
describe('resolveIconDef', () => {
  const MAP = { 'tabler-sun': { id: 'tabler-sun', name: 'Sonne', library: 'tabler' } };

  it('findet für eine Kopie die Definition ihres Katalog-Icons', () => {
    expect(resolveIconDef('icon-1', threeSuns.iconStates, MAP)).toBe(MAP['tabler-sun']);
  });

  it('findet sie auch für ein Dokument ohne iconId', () => {
    expect(resolveIconDef('tabler-sun', legacy.iconStates, MAP)).toBe(MAP['tabler-sun']);
  });

  it('gibt null zurück, wenn der Katalog das Icon nicht kennt', () => {
    expect(resolveIconDef('tabler-leaf', undefined, MAP)).toBeNull();
  });

  it('gibt null zurück, solange der Katalog noch nicht geladen ist', () => {
    expect(resolveIconDef('icon-1', threeSuns.iconStates, null)).toBeNull();
  });
});
