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

/** Die einzige Rolle, die einen Landesverband freischaltet. */
const LGS = 'Mitarbeiter*in Landesgeschäftsstelle';

describe('landesverbandIdsForRoles', () => {
  it('leitet den Landesverband aus der Landesgeschäftsstellen-Rolle ab', () => {
    expect(
      landesverbandIdsForRoles([{ ebene: 'land', rolle: LGS, bundesland: 'Hessen' }], 'de-DE')
    ).toEqual(['hessen']);
  });

  it('ignoriert Rollen unterhalb der Landesebene', () => {
    // Ein Kreisverband nennt zwar ein Bundesland, arbeitet aber nicht im LV —
    // und bei einer ausschließenden Regel kostet eine falsche Vermutung Zugang.
    expect(
      landesverbandIdsForRoles(
        [{ ebene: 'kreisverband', rolle: 'Mitarbeiter*in Kreisverband', bundesland: 'Hessen' }],
        'de-DE'
      )
    ).toEqual([]);
    expect(
      landesverbandIdsForRoles(
        [{ ebene: 'bund', rolle: 'Mitarbeiter*in Bundesgeschäftsstelle' }],
        'de-DE'
      )
    ).toEqual([]);
  });

  it('schaltet nur die Geschäftsstelle frei, nicht die übrige Landesebene', () => {
    // Fraktion und Abgeordnetenbüro sitzen auf derselben Ebene und im selben
    // Bundesland — die Rezepte gehören trotzdem der Geschäftsstelle.
    for (const rolle of ['Mitarbeiter*in Landtagsfraktion', 'Mitarbeiter*in MdL-Büro']) {
      expect(
        landesverbandIdsForRoles([{ ebene: 'land', rolle, bundesland: 'Hessen' }], 'de-DE')
      ).toEqual([]);
    }
  });

  it('bleibt ohne Bundesland leer, statt einen Verband zu raten', () => {
    expect(landesverbandIdsForRoles([{ ebene: 'land', rolle: LGS }], 'de-DE')).toEqual([]);
  });

  it('gibt bei Bundesländern ohne Landesverband nichts zurück', () => {
    expect(
      landesverbandIdsForRoles(
        [{ ebene: 'land', rolle: LGS, bundesland: 'Nordrhein-Westfalen' }],
        'de-DE'
      )
    ).toEqual([]);
  });

  it('lässt abgeschaltete Landesverbände nicht wieder auferstehen', () => {
    // Schleswig-Holstein, Hamburg und Sachsen stehen auf `enabled: false`.
    expect(
      landesverbandIdsForRoles(
        [{ ebene: 'land', rolle: LGS, bundesland: 'Schleswig-Holstein' }],
        'de-DE'
      )
    ).toEqual([]);
  });

  it('ordnet die österreichische Landesorganisation dem einen AT-Verband zu', () => {
    expect(
      landesverbandIdsForRoles(
        [{ ebene: 'land', rolle: 'Mitarbeiter*in Landesorganisation', bundesland: 'Wien' }],
        'de-AT'
      )
    ).toEqual(['oesterreich']);
  });

  it('liefert mehrere Ids in Registry-Reihenfolge', () => {
    const ids = landesverbandIdsForRoles(
      [
        { ebene: 'land', rolle: LGS, bundesland: 'Hessen' },
        { ebene: 'land', rolle: LGS, bundesland: 'Bayern' },
      ],
      'de-DE'
    );
    const order: string[] = LANDESVERBAENDE.map((lv) => lv.id);
    expect(ids).toEqual([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(new Set(ids)).toEqual(new Set(['hessen', 'bayern']));
  });
});

describe('isLvItemVisibleForRoles', () => {
  it('zeigt alles, solange die Rollen noch nicht bekannt sind', () => {
    // `null` ist der Ladezustand — eine Ladephase darf nichts wegnehmen, was
    // gleich wieder erscheint.
    expect(isLvItemVisibleForRoles(bayern.prAgentId, null)).toBe(true);
  });

  it('blendet LV-Inhalte aus, wenn geprüft keine Zuteilung vorliegt', () => {
    // `[]` ist eine Antwort, kein Ladezustand: keine Geschäftsstellenrolle,
    // also kein LV-Material.
    expect(isLvItemVisibleForRoles(bayern.prAgentId, [])).toBe(false);
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
  it('filtert LV-Notebooks, andere nie', () => {
    expect(isLvNotebookVisibleForRoles('hessen-notebook', ['hessen'])).toBe(true);
    expect(isLvNotebookVisibleForRoles('bayern-notebook', ['hessen'])).toBe(false);
    expect(isLvNotebookVisibleForRoles('kommunalwiki-notebook', ['hessen'])).toBe(true);
    expect(isLvNotebookVisibleForRoles('bayern-notebook', null)).toBe(true);
    expect(isLvNotebookVisibleForRoles('bayern-notebook', [])).toBe(false);
  });
});

describe('lvSkillMentionsForRoles', () => {
  it('liefert nur Rezepte des eigenen Landesverbands, kleingeschrieben', () => {
    const mentions = lvSkillMentionsForRoles(
      [{ ebene: 'land', rolle: LGS, bundesland: 'Bayern' }],
      'de-DE'
    );
    // Beide Ebenen des eigenen Landesverbands, keine eines fremden.
    expect(mentions).toContain('presse-bayern-fraktion');
    expect(mentions).toContain('presse-bayern-partei');
    expect(mentions.every((m) => m === m.toLowerCase())).toBe(true);
    expect(mentions).not.toContain('presse-berlin-fraktion');
    expect(mentions).not.toContain('presse-berlin-partei');
  });

  it('bleibt ohne Geschäftsstellenrolle leer', () => {
    expect(
      lvSkillMentionsForRoles(
        [{ ebene: 'bund', rolle: 'Mitarbeiter*in Bundesgeschäftsstelle' }],
        'de-DE'
      )
    ).toEqual([]);
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
  it('nennt genau die Notebooks, die es auch gibt', () => {
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
    expect(landesverbandHeadings(null).agents).toBe('Landesverbände');
    expect(landesverbandHeadings([]).agents).toBe('Landesverbände');
    expect(landesverbandHeadings(['hessen']).agents).toBe('Grüne Hessen');
    expect(landesverbandHeadings(['hessen']).skills).toBe('Rezepte aus Hessen');
    expect(landesverbandHeadings(['hessen', 'bayern']).agents).toBe('Deine Landesverbände');
  });
});
