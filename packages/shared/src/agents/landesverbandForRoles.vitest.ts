import { describe, expect, it } from 'vitest';

import {
  isLvItemVisibleForRoles,
  isLvNotebookVisibleForRoles,
  landesverbandHeadings,
  landesverbandIdsForRoles,
  landesverbandOfferForBundesland,
  lvSkillMentionsForRoles,
} from './landesverbandForRoles.js';
import { LANDESVERBAENDE } from './landesverbaende.js';
import { DE_BUNDESLAENDER } from '../roles/rolesConfig.js';

const hessen = LANDESVERBAENDE.find((lv) => lv.id === 'hessen')!;
const bayern = LANDESVERBAENDE.find((lv) => lv.id === 'bayern')!;

describe('landesverbandIdsForRoles', () => {
  it('leitet den Landesverband aus einer Landesrolle ab', () => {
    expect(landesverbandIdsForRoles([{ ebene: 'land', bundesland: 'Hessen' }], 'de-DE')).toEqual([
      'hessen',
    ]);
  });

  it('ignoriert Rollen unterhalb der Landesebene', () => {
    // Ein Kreisverband nennt zwar ein Bundesland, arbeitet aber nicht im LV —
    // und bei einer ausschließenden Regel kostet eine falsche Vermutung Zugang.
    expect(
      landesverbandIdsForRoles([{ ebene: 'kreisverband', bundesland: 'Hessen' }], 'de-DE')
    ).toEqual([]);
    expect(landesverbandIdsForRoles([{ ebene: 'bund' }], 'de-DE')).toEqual([]);
  });

  it('gibt bei Bundesländern ohne Landesverband nichts zurück', () => {
    expect(
      landesverbandIdsForRoles([{ ebene: 'land', bundesland: 'Nordrhein-Westfalen' }], 'de-DE')
    ).toEqual([]);
  });

  it('lässt abgeschaltete Landesverbände nicht wieder auferstehen', () => {
    // Schleswig-Holstein, Hamburg und Sachsen stehen auf `enabled: false`.
    expect(
      landesverbandIdsForRoles([{ ebene: 'land', bundesland: 'Schleswig-Holstein' }], 'de-DE')
    ).toEqual([]);
  });

  it('ordnet österreichische Landesrollen dem einen AT-Verband zu', () => {
    expect(landesverbandIdsForRoles([{ ebene: 'land', bundesland: 'Wien' }], 'de-AT')).toEqual([
      'oesterreich',
    ]);
  });

  it('liefert mehrere Ids in Registry-Reihenfolge', () => {
    const ids = landesverbandIdsForRoles(
      [
        { ebene: 'land', bundesland: 'Hessen' },
        { ebene: 'land', bundesland: 'Bayern' },
      ],
      'de-DE'
    );
    const order: string[] = LANDESVERBAENDE.map((lv) => lv.id);
    expect(ids).toEqual([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(new Set(ids)).toEqual(new Set(['hessen', 'bayern']));
  });
});

describe('isLvItemVisibleForRoles', () => {
  it('zeigt ohne Rollenangabe weiterhin alles', () => {
    expect(isLvItemVisibleForRoles(bayern.prAgentId, [])).toBe(true);
  });

  it('lässt Nicht-LV-Agenten immer durch', () => {
    expect(isLvItemVisibleForRoles('gruenerator-universal', ['hessen'])).toBe(true);
  });

  it('blendet fremde Landesverbände aus, den eigenen nicht', () => {
    expect(isLvItemVisibleForRoles(hessen.prAgentId, ['hessen'])).toBe(true);
    expect(isLvItemVisibleForRoles(hessen.buergerAgentId, ['hessen'])).toBe(true);
    expect(isLvItemVisibleForRoles(hessen.wahlpruefsteinAgentId, ['hessen'])).toBe(true);
    expect(isLvItemVisibleForRoles(bayern.prAgentId, ['hessen'])).toBe(false);
  });
});

describe('isLvNotebookVisibleForRoles', () => {
  it('filtert LV-Notizbücher, andere nie', () => {
    expect(isLvNotebookVisibleForRoles('hessen-notebook', ['hessen'])).toBe(true);
    expect(isLvNotebookVisibleForRoles('bayern-notebook', ['hessen'])).toBe(false);
    expect(isLvNotebookVisibleForRoles('kommunalwiki-notebook', ['hessen'])).toBe(true);
    expect(isLvNotebookVisibleForRoles('bayern-notebook', [])).toBe(true);
  });
});

describe('lvSkillMentionsForRoles', () => {
  it('liefert nur Rezepte des eigenen Landesverbands, kleingeschrieben', () => {
    const mentions = lvSkillMentionsForRoles([{ ebene: 'land', bundesland: 'Bayern' }], 'de-DE');
    expect(mentions).toContain('presse-bayern');
    expect(mentions.every((m) => m === m.toLowerCase())).toBe(true);
    expect(mentions).not.toContain('presse-berlin');
  });

  it('bleibt ohne Landesrolle leer', () => {
    expect(lvSkillMentionsForRoles([{ ebene: 'bund' }], 'de-DE')).toEqual([]);
  });
});

describe('landesverbandOfferForBundesland', () => {
  it('nennt Agenten- und Rezeptzahl für einen aktiven Landesverband', () => {
    const offer = landesverbandOfferForBundesland('Hessen');
    expect(offer).not.toBeNull();
    expect(offer?.lvId).toBe('hessen');
    expect(offer?.agents).toBe(3);
    expect(offer?.notebookId).toBe('hessen-notebook');
  });

  it('gibt für Länder ohne Landesverband null zurück', () => {
    expect(landesverbandOfferForBundesland('Bremen')).toBeNull();
    expect(landesverbandOfferForBundesland('Schleswig-Holstein')).toBeNull();
  });
});

describe('DE_BUNDESLAENDER', () => {
  it('nennt genau die Notizbücher, die es auch gibt', () => {
    const byLabel = new Map(DE_BUNDESLAENDER.map((bl) => [bl.label, bl.notebookId]));
    expect(byLabel.get('Hessen')).toBe('hessen-notebook');
    expect(byLabel.get('Saarland')).toBe('saarland-notebook');
    expect(byLabel.get('Sachsen-Anhalt')).toBe('sachsen-anhalt-notebook');
    // Abgeschaltete Notebooks dürfen nicht als vorhanden angepriesen werden.
    expect(byLabel.get('Schleswig-Holstein')).toBeUndefined();
    expect(byLabel.get('Hamburg')).toBeUndefined();
    expect(byLabel.get('Sachsen')).toBeUndefined();
    // Länder ohne Landesverband.
    expect(byLabel.get('Nordrhein-Westfalen')).toBeUndefined();
  });

  it('deckt jedes Bundesland-Label die Registry-Titel ab', () => {
    // Das Label IST der Join-Schlüssel — driftet es, fällt die Zuteilung still aus.
    const labels = new Set(DE_BUNDESLAENDER.map((bl) => bl.label));
    for (const lv of LANDESVERBAENDE.filter((entry) => entry.audience === 'de-DE')) {
      expect(labels.has(lv.title)).toBe(true);
    }
  });
});

describe('landesverbandHeadings', () => {
  it('beugt die Überschrift nach Anzahl', () => {
    expect(landesverbandHeadings([]).agents).toBe('Landesverbände');
    expect(landesverbandHeadings(['hessen']).agents).toBe('Grüne Hessen');
    expect(landesverbandHeadings(['hessen']).skills).toBe('Rezepte aus Hessen');
    expect(landesverbandHeadings(['hessen', 'bayern']).agents).toBe('Deine Landesverbände');
  });
});
