import { type SharepicVorlage } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { heuristicClassify } from '../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { acceptsVorlagenOffer } from '../../../agents/langgraph/ChatGraph/nodes/classifierSignals.js';

import {
  makeSuggestVorlagenTool,
  mentionsVorlagen,
  vorlagenForTurn,
  vorlagenOfferNote,
} from './vorlagenTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const catalog = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../../services/sharepicVorlagen/catalog.js', () => ({
  listSharepicVorlagen: catalog.list,
}));

function vorlage(id: string, locale: 'de-DE' | 'de-AT', extra: Partial<SharepicVorlage> = {}) {
  return {
    id,
    titel: `Titel ${id}`,
    beschreibung: `Beschreibung ${id}`,
    form: 'zitat',
    herkunft: 'beispiel',
    chat: { prompts: ['Zitat-Sharepic'] },
    spec: { slides: [{}, {}] },
    locale,
    attributions: [],
    thumbVersion: 'abc',
    ...extra,
  } as unknown as SharepicVorlage;
}

const DE = [
  vorlage('de-zitat', 'de-DE', { anlass: 'Statement einer Person' }),
  vorlage('de-info', 'de-DE'),
];
const AT = [vorlage('at-zitat', 'de-AT')];

beforeEach(() => {
  catalog.list.mockImplementation((locale: string) => (locale === 'de-AT' ? AT : DE));
});

function state(extra: Partial<ChatGraphState> = {}): ChatGraphState {
  return { messages: [], userLocale: 'de-DE', ...extra } as unknown as ChatGraphState;
}

function run(tool: ReturnType<typeof makeSuggestVorlagenTool>, input: unknown) {
  return (tool.execute as (i: unknown, o: unknown) => unknown)(input, {
    toolCallId: 't',
    messages: [],
  });
}

describe('mentionsVorlagen', () => {
  it.each([
    'Welche Design-Vorlagen passen dazu?',
    'Zeig mir eine Sharepic-Vorlage für den Post',
    'hast du passende Vorlagen?',
    'welche Vorlage passt zu meinem Beitrag',
    'gib mir ein paar Designoptionen',
    'und wie könnte das als Grafik aussehen?',
    'wie könnte ich das bebildern?',
  ])('trifft „%s"', (text) => {
    expect(mentionsVorlagen(text)).toBe(true);
  });

  it.each([
    'Schreib eine Beschlussvorlage zur Radverkehrsplanung',
    'Ich brauche eine Word-Vorlage für das Protokoll',
    'Schreib einen Instagram-Post zur Verkehrswende',
    'mach mir eine Grafik dazu',
  ])('trifft nicht „%s"', (text) => {
    expect(mentionsVorlagen(text)).toBe(false);
  });

  it('erbt die Rückfrage für ein knappes Ja, aber nicht für einen neuen Auftrag', () => {
    const frage = 'Soll ich dir passende Design-Vorlagen zeigen?';
    expect(mentionsVorlagen('ja gern', frage)).toBe(true);
    expect(
      mentionsVorlagen(
        'Schreib mir jetzt bitte noch eine Pressemitteilung zum selben Thema mit Zitat',
        frage
      )
    ).toBe(false);
  });
});

describe('vorlagenForTurn', () => {
  it('montiert auf Vokabular nur den Katalog des eigenen Landes', () => {
    const at = vorlagenForTurn(
      state({ userLocale: 'de-AT', lastUserTextNoMentions: 'passende Vorlagen?' })
    );
    expect(at?.map((v) => v.id)).toEqual(['at-zitat']);
  });

  it('montiert unter einem Social-Rezept auch ohne Vokabular', () => {
    expect(
      vorlagenForTurn(
        state({ activeSkillMention: 'instagram', lastUserTextNoMentions: 'Post zu Kitas' })
      )
    ).not.toBeNull();
    expect(
      vorlagenForTurn(
        state({ activeSkillMention: 'presse', lastUserTextNoMentions: 'PM zu Kitas' })
      )
    ).toBeNull();
  });

  it('montiert nicht bei leerem Länderkatalog', () => {
    catalog.list.mockReturnValue([]);
    expect(vorlagenForTurn(state({ lastUserTextNoMentions: 'passende Vorlagen?' }))).toBeNull();
  });
});

describe('vorlagen_vorschlagen', () => {
  it('sendet die Galerie mit Grund, Thumb und Seitenzahl', async () => {
    const sse = { send: vi.fn() };
    const s = state();
    const tool = makeSuggestVorlagenTool({ sse: sse as never, state: s, vorlagen: DE });
    expect(tool.description).toContain(
      'de-zitat · Titel de-zitat (zitat, 2 Seiten): Statement einer Person'
    );
    expect(tool.description).toContain(
      'de-info · Titel de-info (zitat, 2 Seiten): Beschreibung de-info'
    );

    const result = await run(tool, {
      beitrag: 'Kitas statt Parkplätze!',
      auswahl: [{ id: 'de-zitat', grund: 'Der Post trägt ein Zitat.' }],
    });
    const vorlagen = [
      {
        id: 'de-zitat',
        titel: 'Titel de-zitat',
        form: 'zitat',
        grund: 'Der Post trägt ein Zitat.',
        format: 'post-portrait',
        seiten: 2,
        thumbUrl: '/api/sharepic-vorlagen/de-zitat/thumb?v=abc',
      },
    ];
    expect(sse.send).toHaveBeenCalledWith('vorlagen_suggestions', {
      vorlagen,
      beitrag: 'Kitas statt Parkplätze!',
    });
    expect(result).toMatchObject({ vorlagen, beitrag: 'Kitas statt Parkplätze!' });
    expect(s.vorlagenShown).toEqual(['Titel de-zitat']);
  });

  it('verwirft fremde, erfundene und doppelte IDs', async () => {
    const sse = { send: vi.fn() };
    const tool = makeSuggestVorlagenTool({ sse: sse as never, state: state(), vorlagen: DE });
    const result = (await run(tool, {
      beitrag: 'x',
      auswahl: [
        { id: 'at-zitat', grund: 'x' },
        { id: 'de-info', grund: 'a' },
        { id: 'de-info', grund: 'b' },
      ],
    })) as { vorlagen: { id: string }[] };
    expect(result.vorlagen.map((v) => v.id)).toEqual(['de-info']);
  });

  it('meldet nur ungültige IDs als Fehler und zeigt nichts', async () => {
    const sse = { send: vi.fn() };
    const tool = makeSuggestVorlagenTool({ sse: sse as never, state: state(), vorlagen: DE });
    const result = await run(tool, { beitrag: 'x', auswahl: [{ id: 'at-zitat', grund: 'x' }] });
    expect(result).toHaveProperty('error');
    expect(sse.send).not.toHaveBeenCalled();
  });
});

describe('vorlagenOfferNote', () => {
  it('bietet nach einem Social-Rezept die Vorlagen als Rückfrage an', () => {
    const note = vorlagenOfferNote(state(), ['instagram']);
    expect(note).toContain('Rückfrage');
    expect(mentionsVorlagen('ja gern', note)).toBe(true);
  });

  it('schweigt ohne Social-Rezept, nach gezeigter Galerie und ohne Katalog', () => {
    expect(vorlagenOfferNote(state(), ['presse'])).toBe('');
    expect(vorlagenOfferNote(state({ enabledTools: { vorlagen: false } }), ['instagram'])).toBe('');
    expect(vorlagenOfferNote(state({ vorlagenShown: ['Titel de-zitat'] }), ['instagram'])).toBe('');
    catalog.list.mockReturnValue([]);
    expect(vorlagenOfferNote(state(), ['instagram'])).toBe('');
  });
});

describe('Klassifikator-Weg in den Loop', () => {
  it.each([
    'Zeig mir, welche Design-Vorlage zu diesem Beitrag passt',
    'hab nen post zum klimaticket geplant, hast du designideen dafuer?',
    'und wie könnte das als Grafik aussehen?',
  ])('„%s" landet im examples-Loop, wo das Werkzeug erzwungen werden darf', (text) => {
    expect(heuristicClassify(text).intent).toBe('examples');
  });

  it('ein Schreibauftrag mit Vorlagen-Wunsch bleibt ein Schreibauftrag', () => {
    expect(
      heuristicClassify('Schreib einen Instagram-Post zur Verkehrswende und zeig passende Vorlagen')
        .intent
    ).toBe('produktion');
  });
});

describe('acceptsVorlagenOffer', () => {
  const frage = 'Soll ich dir passende Sharepic-Vorlagen zeigen?';

  it.each(['ja', 'Ja gerne!', 'gern, zeig mal', 'klar', 'zeig her'])(
    '„%s" nimmt das Angebot an',
    (t) => {
      expect(acceptsVorlagenOffer(t, frage)).toBe(true);
    }
  );

  it('nicht ohne Angebot, nicht bei Ablehnung, nicht bei neuem Auftrag', () => {
    expect(acceptsVorlagenOffer('ja', 'Hier ist dein Post.')).toBe(false);
    expect(acceptsVorlagenOffer('nein danke', frage)).toBe(false);
    expect(
      acceptsVorlagenOffer('ja, aber schreib mir erst noch eine Pressemitteilung zum Thema', frage)
    ).toBe(false);
  });
});
