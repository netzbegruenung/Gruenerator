/**
 * Ein im Text GENANNTES Notebook wird zum Notebook des Turns — wie eine
 * @-Erwähnung. Das Routing ist eine Einbahnstraße (ein gescopter Turn sucht nur
 * noch im Notebook), deshalb sind die Negativfälle der Punkt: „Berlin" allein
 * scoped nie.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  findNotebookNamedInText,
  notebookIdsForTurn,
  OWN_NOTEBOOK_LIST_TIMEOUT_MS,
  mayNameOwnNotebook,
  ownNotebookNameCacheSize,
  resetOwnNotebookNameCache,
  resolveNotebookScopeFromText,
  systemNotebookCandidates,
  type NotebookNameCandidate,
} from './notebookScopeFromText.js';

const OWN_ID = '3f1c2b7a-9d4e-4c5b-8a6f-1e2d3c4b5a69';
const OWN_ID_2 = '7a1c2b7a-9d4e-4c5b-8a6f-1e2d3c4b5a70';

const candidates = (): NotebookNameCandidate[] => [
  ...systemNotebookCandidates('de-DE'),
  { id: OWN_ID, names: ['Kreisverband Nord'], own: true },
];

describe('findNotebookNamedInText — trifft', () => {
  it.each([
    ['Liste die 20 neuesten Quellen im Berlin-Notebook aus 2026.', 'berlin-notebook'],
    ['Was steht im Berlin Notebook zu Mieten?', 'berlin-notebook'],
    ['Durchsuche das Notebook Berlin nach Radwegen', 'berlin-notebook'],
    ['Wie oft kommt „Klimaschutz" im ganzen Berlin-Notebook vor?', 'berlin-notebook'],
    ['Öffne im Bayern-Notebook das Wahlprogramm', 'bayern-notebook'],
    ['Was steht im Sachsen-Anhalt-Notebook zur Windkraft?', 'sachsen-anhalt-notebook'],
    // Das alte Wort bleibt im Detektor über Nutzereingaben (CLAUDE.md-Ausnahme).
    ['Was steht im Berlin-Notizbuch zu Mieten?', 'berlin-notebook'],
    ['Sortiere die Quellen im Notebook „Kreisverband Nord" nach Datum', OWN_ID],
    ['Sortiere im Kreisverband-Nord-Notebook die Quellen', OWN_ID],
    // Voller Name eines EIGENEN Notebooks, ohne das Wort Notebook.
    ['Was steht in Kreisverband Nord zur Kita-Satzung?', OWN_ID],
  ])('%s', (text, expected) => {
    expect(findNotebookNamedInText(text, candidates())).toBe(expected);
  });
});

describe('findNotebookNamedInText — trifft NICHT', () => {
  it.each([
    'Was steht im Berliner Wahlprogramm zu Mieten?',
    'Berlin',
    'Wie ist die Berliner Mietenpolitik?',
    'Was ist ein Notebook?',
    'Welches Notebook soll ich kaufen?',
    'Mein Laptop-Notebook ist kaputt',
    'Liste die 20 neuesten Pressemitteilungen der Grünen Berlin auf.',
    // Zwei Notebooks → mehrdeutig → kein Scope.
    'Vergleiche das Berlin-Notebook mit dem Bayern-Notebook',
    // Abgeschaltete Notebooks (`enabled: false`) sind keine Kandidaten.
    'Was steht im Hamburg-Notebook zur Hafenpolitik?',
    // Nur ein Wort des eigenen Namens.
    'Was sagt der Kreisverband zur Kita-Satzung?',
    // Eigener Name nur in anderer Schreibung — ohne das Wort Notebook zählt
    // nur der exakte Name.
    'was steht in kreisverband nord zur kita-satzung?',
    '',
  ])('%s', (text) => {
    expect(findNotebookNamedInText(text, candidates())).toBeNull();
  });

  it('ein Mehr-Sammlungs-Notebook ist kein Kandidat („alle Notebooks")', () => {
    expect(findNotebookNamedInText('Liste alle Notebooks auf', candidates())).toBeNull();
    expect(systemNotebookCandidates('de-DE').map((c) => c.id)).not.toContain(
      'gruenerator-notebook'
    );
  });

  it('ein eigener Einwort-Name scoped nur mit dem Wort Notebook', () => {
    const own: NotebookNameCandidate[] = [{ id: OWN_ID, names: ['Klima'], own: true }];
    expect(findNotebookNamedInText('Was sagt ihr zum Klima?', own)).toBeNull();
    expect(findNotebookNamedInText('Was steht im Klima-Notebook?', own)).toBe(OWN_ID);
  });

  it('ein eigener Name ohne das Wort Notebook zählt nur hinter „in/im/aus"', () => {
    const own: NotebookNameCandidate[] = [{ id: OWN_ID, names: ['Die Grünen'], own: true }];
    expect(findNotebookNamedInText('Die Grünen fordern mehr Radwege', own)).toBeNull();
    expect(findNotebookNamedInText('Was steht in Die Grünen zu Radwegen?', own)).toBe(OWN_ID);
  });

  it('zwei eigene Notebooks mit demselben Namen → mehrdeutig', () => {
    const own: NotebookNameCandidate[] = [
      { id: OWN_ID, names: ['Kreisverband Nord'], own: true },
      { id: OWN_ID_2, names: ['Kreisverband Nord'], own: true },
    ];
    expect(findNotebookNamedInText('im Notebook Kreisverband Nord', own)).toBeNull();
  });
});

describe('systemNotebookCandidates — Locale', () => {
  it('AT sieht die deutschen Landesverbände nicht', () => {
    const at = systemNotebookCandidates('de-AT').map((c) => c.id);
    expect(at).not.toContain('berlin-notebook');
    expect(findNotebookNamedInText('im Berlin-Notebook', systemNotebookCandidates('de-AT'))).toBe(
      null
    );
  });

  it('DE sieht Berlin', () => {
    expect(systemNotebookCandidates('de-DE').map((c) => c.id)).toContain('berlin-notebook');
  });
});

describe('resolveNotebookScopeFromText', () => {
  afterEach(() => resetOwnNotebookNameCache());

  it('liest die eigenen Notebooks und findet den Namen', async () => {
    const listOwn = vi.fn(async () => [{ id: OWN_ID, name: 'Kreisverband Nord' }]);
    const id = await resolveNotebookScopeFromText({
      userId: 'u1',
      text: 'Sortiere im Notebook Kreisverband Nord die Quellen',
      locale: 'de-DE',
      listOwn,
    });
    expect(id).toBe(OWN_ID);
  });

  it('cacht die Liste je Konto (ein Scroll pro Minute, nicht pro Turn)', async () => {
    const listOwn = vi.fn(async () => []);
    const args = { userId: 'u1', text: 'im Berlin-Notebook', locale: 'de-DE', listOwn };
    await resolveNotebookScopeFromText(args);
    await resolveNotebookScopeFromText(args);
    expect(listOwn).toHaveBeenCalledTimes(1);
  });

  it('ein Ausfall der Liste lässt System-Notebooks weiter treffen', async () => {
    const listOwn = vi.fn(async () => {
      throw new Error('qdrant down');
    });
    const id = await resolveNotebookScopeFromText({
      userId: 'u1',
      text: 'Liste die Quellen im Berlin-Notebook',
      locale: 'de-DE',
      listOwn,
    });
    expect(id).toBe('berlin-notebook');
  });

  it('eine hängende Liste hält den Turn nicht auf', async () => {
    vi.useFakeTimers();
    try {
      const listOwn = vi.fn(() => new Promise<never>(() => {}));
      const pending = resolveNotebookScopeFromText({
        userId: 'u1',
        text: 'Liste die Quellen im Berlin-Notebook',
        locale: 'de-DE',
        listOwn,
      });
      await vi.advanceTimersByTimeAsync(OWN_NOTEBOOK_LIST_TIMEOUT_MS);
      await expect(pending).resolves.toBe('berlin-notebook');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ein Ausfall wird kurz gemerkt — der nächste Turn wartet nicht erneut', async () => {
    const listOwn = vi.fn(async () => {
      throw new Error('qdrant down');
    });
    const args = { userId: 'u1', text: 'im Berlin-Notebook', locale: 'de-DE', listOwn };
    await resolveNotebookScopeFromText(args);
    await resolveNotebookScopeFromText(args);
    expect(listOwn).toHaveBeenCalledTimes(1);
  });

  it('abgelaufene Einträge fliegen beim nächsten Schreiben raus', async () => {
    vi.useFakeTimers();
    try {
      const listOwn = vi.fn(async () => []);
      await resolveNotebookScopeFromText({
        userId: 'a',
        text: 'im Berlin-Notebook',
        locale: 'de-DE',
        listOwn,
      });
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      await resolveNotebookScopeFromText({
        userId: 'b',
        text: 'im Berlin-Notebook',
        locale: 'de-DE',
        listOwn,
      });
      expect(ownNotebookNameCacheSize()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['Hallo', 'Was ist der Stand beim Tempolimit?', 'Schreib mir einen Post zur Wärmewende'])(
    'ein Text, der kein eigenes Notebook nennen kann, fragt die Liste nicht ab: %s',
    async (text) => {
      const listOwn = vi.fn(async () => []);
      await resolveNotebookScopeFromText({ userId: 'u1', text, locale: 'de-DE', listOwn });
      expect(listOwn).not.toHaveBeenCalled();
    }
  );

  it('leerer Text fragt die Liste gar nicht erst ab', async () => {
    const listOwn = vi.fn(async () => []);
    const id = await resolveNotebookScopeFromText({
      userId: 'u1',
      text: '   ',
      locale: 'de-DE',
      listOwn,
    });
    expect(id).toBeNull();
    expect(listOwn).not.toHaveBeenCalled();
  });
});

describe('notebookIdsForTurn — nur ohne gewähltes Notebook', () => {
  afterEach(() => resetOwnNotebookNameCache());
  const listOwn = vi.fn(async () => []);
  const base = { userId: 'u1', locale: 'de-DE', listOwn };

  it('ohne Auswahl scoped der genannte Name', async () => {
    const ids = await notebookIdsForTurn({
      ...base,
      explicitIds: [],
      hasDefaultNotebook: false,
      text: 'Liste die Quellen im Berlin-Notebook',
    });
    expect(ids).toEqual(['berlin-notebook']);
  });

  it('eine Erwähnung gewinnt, der Text wird gar nicht gelesen', async () => {
    const ids = await notebookIdsForTurn({
      ...base,
      explicitIds: [OWN_ID],
      hasDefaultNotebook: false,
      text: 'Liste die Quellen im Berlin-Notebook',
    });
    expect(ids).toEqual([OWN_ID]);
  });

  it('ein Standard-Notebook im Composer ist eine Auswahl — kein Scope aus dem Text', async () => {
    const ids = await notebookIdsForTurn({
      ...base,
      explicitIds: [],
      hasDefaultNotebook: true,
      text: 'Liste die Quellen im Berlin-Notebook',
    });
    expect(ids).toEqual([]);
  });
});

describe('mayNameOwnNotebook — das billige Tor vor der Liste', () => {
  it.each([
    'Sortiere im Notebook die Quellen',
    'Was steht im Berlin-Notizbuch?',
    'Was steht in Kreisverband Nord zur Satzung?',
    'Lies aus meinem „Kreisverband Nord" vor',
  ])('fragt nach: %s', (text) => {
    expect(mayNameOwnNotebook(text)).toBe(true);
  });

  it.each(['Hallo', 'Was steht in der Satzung?', 'Wie ist das Wetter in Berlin?', ''])(
    'fragt nicht: %s',
    (text) => {
      expect(mayNameOwnNotebook(text)).toBe(false);
    }
  );
});
