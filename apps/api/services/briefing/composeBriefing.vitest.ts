import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CLOSING_QUESTION,
  FALLBACK_NEWS_LEAD,
  FALLBACK_TASKS_LEAD,
  briefingTitle,
  composeBriefing,
  dueLabel,
  fallbackIntro,
  greetingLine,
} from './composeBriefing.js';

import type { BriefingInputs, PersonalLines } from './types.js';

// Freitag, 6. Nov. 2026, 08:30 in Berlin (07:30 UTC).
const NOW = new Date('2026-11-06T07:30:00Z');

function inputs(over: Partial<BriefingInputs> = {}): BriefingInputs {
  return {
    userId: 'u1',
    firstName: 'Moritz',
    locale: 'de-DE',
    roleLine: null,
    ebene: null,
    cards: [],
    lagebild: null,
    lvName: null,
    lvNews: [],
    partyNews: [],
    recent: [],
    ...over,
  };
}

const card = (title: string, dueDate: string | null, cardId = title) => ({
  boardId: 'b1',
  boardTitle: 'Wahlkampf KV',
  cardId,
  title,
  dueDate,
});

const LAGEBILD = {
  locale: 'de' as const,
  generatedAt: NOW.toISOString(),
  items: [
    {
      kind: 'welt' as const,
      topic: 'klima',
      text: 'Der Klimagipfel beginnt.',
      url: 'https://a.example/1',
      source: 'tagesschau',
    },
    {
      kind: 'partei' as const,
      topic: null,
      text: 'Die Grünen legen ein Mietenpapier vor.',
      url: 'https://a.example/2',
      source: 'SZ',
    },
    {
      kind: 'welt' as const,
      topic: 'mobilitaet',
      text: 'Die Bahn streicht Verbindungen.',
      url: 'https://a.example/3',
      source: 'Spiegel',
    },
  ],
};

const PERSONAL: PersonalLines = {
  intro: 'Zwei Aufgaben drängen heute, und beim Klima tut sich was.',
  tasksLead: 'Das wartet auf dich:',
  newsLead: null,
  recap: 'Du hast zuletzt am Antrag Kitaplätze gesessen.',
  ideasLead: null,
  ideas: ['ein Sharepic zum Kita-Antrag bauen', 'Aktionsideen für den Radentscheid sammeln'],
  basedOn: 'c1',
  suggestions: ['Post dazu entwerfen'],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('composeBriefing', () => {
  it('returns null when there is nothing to say', () => {
    expect(composeBriefing(inputs(), null, NOW)).toBeNull();
  });

  it('builds all sections with greeting, intro, tasks, news and idea', () => {
    const result = composeBriefing(
      inputs({
        cards: [
          card('Pressemitteilung', '2026-11-02'),
          card('Antrag', '2026-11-06'),
          card('Plan', '2026-11-13'),
        ],
        lagebild: LAGEBILD,
      }),
      PERSONAL,
      NOW
    );
    expect(result).not.toBeNull();
    const md = result!.markdown;
    const [greeting, intro] = md.split('\n\n');
    expect(greeting).toMatch(/^.+, Moritz\.$/);
    expect(intro).toMatch(/^Zwei Aufgaben drängen heute/);
    expect(md).toContain('Das wartet auf dich:\n- **Pressemitteilung**');
    expect(md).toContain(
      '- **Pressemitteilung**: überfällig seit Mo · [Wahlkampf KV](/boards/b1?card=Pressemitteilung)'
    );
    expect(md).toContain('- **Antrag**: heute fällig');
    expect(md).toContain('- **Plan**: bis 13. Nov.');
    expect(md).toContain(`${FALLBACK_NEWS_LEAD}\n`);
    expect(md).toContain(
      'Du hast zuletzt am Antrag Kitaplätze gesessen.\n\nUm weiterzumachen, könnten wir zum Beispiel:\n- ein Sharepic zum Kita-Antrag bauen\n- Aktionsideen für den Radentscheid sammeln'
    );
    expect(md).not.toContain(CLOSING_QUESTION);
    expect(result!.followUpSuggestions).toEqual(['Post dazu entwerfen']);
    expect(result!.title).toBe('Dein Tag · 6. Nov.');
    expect(result!.notificationTitle).toBe('Moritz, dein Tag ist da');
    expect(result!.notificationBody).toBe('3 Aufgaben · Lagebild · Ideen für heute');
  });

  it('puts party lines first and caps the task list with a remainder line', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'].map((t) => card(t, null));
    const md = composeBriefing(inputs({ cards, lagebild: LAGEBILD }), null, NOW)!.markdown;
    expect(md).toContain('+2 weitere auf deinen Boards');
    const news = md.split(`${FALLBACK_NEWS_LEAD}\n`)[1]!.split('\n\n')[0]!.split('\n');
    expect(news[0]).toContain('**Grüne in den Medien:**');
    expect(news[0]).toContain('([SZ](https://a.example/2))');
  });

  it('orders world lines by the role level (municipal levels read mobility first)', () => {
    const md = composeBriefing(
      inputs({ lagebild: LAGEBILD, ebene: 'kreisverband' }),
      null,
      NOW
    )!.markdown;
    const news = md.split(`${FALLBACK_NEWS_LEAD}\n`)[1]!.split('\n\n')[0]!.split('\n');
    expect(news[1]).toContain('**Mobilität:**');
    expect(news[2]).toContain('**Klima & Umwelt:**');
  });

  it('adds the LV line first when there is LV news', () => {
    const md = composeBriefing(
      inputs({
        lagebild: LAGEBILD,
        lvName: 'Bayern',
        lvNews: [
          {
            title: 'Beschluss zur Wärmewende',
            url: 'https://gruene-bayern.de/x',
            sourceName: 'Grüne Bayern',
            day: '2026-11-05',
          },
        ],
      }),
      null,
      NOW
    )!.markdown;
    const news = md.split(`${FALLBACK_NEWS_LEAD}\n`)[1]!.split('\n\n')[0]!.split('\n');
    expect(news[0]).toBe(
      '- **Neu im LV Bayern:** „Beschluss zur Wärmewende“ (gestern) ([Grüne Bayern](https://gruene-bayern.de/x))'
    );
    expect(news).toHaveLength(4);
  });

  it('short form: no idea ends with the closing question and a fallback intro', () => {
    const md = composeBriefing(inputs({ lagebild: LAGEBILD }), null, NOW)!.markdown;
    expect(md.endsWith(CLOSING_QUESTION)).toBe(true);
    expect(md).toContain('Schön, dass du da bist. Draußen ist heute einiges los.');
    expect(md).not.toContain(FALLBACK_TASKS_LEAD);
  });

  it('falls back to a task chip when the model gave no suggestions', () => {
    const result = composeBriefing(inputs({ cards: [card('Antrag', null)] }), null, NOW)!;
    expect(result.followUpSuggestions).toEqual(['Hilf mir mit „Antrag“']);
  });

  it('escapes markdown in card titles', () => {
    const md = composeBriefing(
      inputs({ cards: [card('*wichtig* [x]', null)] }),
      null,
      NOW
    )!.markdown;
    expect(md).toContain('- **\\*wichtig\\* \\[x\\]**');
  });

  it('greets without a name when none is known', () => {
    const result = composeBriefing(
      inputs({ firstName: null, cards: [card('A', null)] }),
      null,
      NOW
    )!;
    expect(result.markdown.split('\n\n')[0]).not.toContain(',');
    expect(result.notificationTitle).toBe('Dein Tag ist da');
  });
});

describe('party news', () => {
  it('adds the federal party line after the LV line and before the Lagebild', () => {
    vi.setSystemTime(NOW);
    const md = composeBriefing(
      inputs({
        locale: 'de-AT',
        lagebild: LAGEBILD,
        partyNews: [
          {
            title: 'Klimabonus kommt',
            url: 'https://gruene.at/x',
            sourceName: 'gruene.at',
            day: '2026-11-06',
          },
        ],
      }),
      null,
      NOW
    )!.markdown;
    const news = md.split(`${FALLBACK_NEWS_LEAD}\n`)[1]!.split('\n\n')[0]!.split('\n');
    expect(news[0]).toBe(
      '- **Neu bei den Grünen:** „Klimabonus kommt“ (heute, [gruene.at](https://gruene.at/x))'
    );
    expect(news).toHaveLength(4);
  });
});

describe('greetingLine', () => {
  it('uses the Berlin hour, not the server clock, and never says good night', () => {
    // 5 Uhr in Berlin → wie 6 Uhr: ein Morgengruß.
    expect(greetingLine('Moritz', 'de-DE', 5)).not.toMatch(/Nacht/);
    expect(greetingLine('Moritz', 'de-DE', 20)).toBe('Guten Abend, Moritz.');
  });

  it('greets in Austrian', () => {
    expect(['Servus, Moritz.', 'Grüß dich, Moritz.', 'Guten Morgen, Moritz.']).toContain(
      greetingLine('Moritz', 'de-AT', 8)
    );
  });
});

describe('dueLabel', () => {
  const today = '2026-11-06'; // Freitag
  it.each([
    ['2026-11-04', 'überfällig seit Mi'],
    ['2026-10-20', 'überfällig seit 20. Okt.'],
    ['2026-11-06', 'heute fällig'],
    ['2026-11-07', 'morgen fällig'],
    ['2026-11-10', 'bis Dienstag'],
    ['2026-11-30', 'bis 30. Nov.'],
  ])('%s → %s', (due, label) => {
    expect(dueLabel(due, today, 'de-DE')).toBe(label);
  });
});

describe('briefingTitle', () => {
  it('uses Jänner in Austria', () => {
    expect(briefingTitle('2027-01-08', 'de-AT')).toBe('Dein Tag · 8. Jän.');
    expect(briefingTitle('2027-01-08', 'de-DE')).toBe('Dein Tag · 8. Jan.');
  });
});

describe('fallbackIntro', () => {
  it('counts tasks in words', () => {
    expect(fallbackIntro(1, false, false)).toBe('Eine Aufgabe wartet heute auf dich.');
    expect(fallbackIntro(2, true, true)).toBe(
      'Zwei Aufgaben warten heute auf dich, und im Lagebild gibt es Neues.'
    );
  });
});
