import { parseMentionTokens } from '@gruenerator/shared/utils';
import { describe, expect, it } from 'vitest';

import { type Mentionable } from './mentionables';
import {
  buildMentionPrefix,
  computeMentionInsertion,
  computePillMentionInsertion,
} from './mentionInsertion';

const mentionable = (overrides: Partial<Mentionable>): Mentionable => ({
  type: 'tool',
  category: 'function',
  trigger: '@',
  identifier: 'websearch',
  title: 'Websuche',
  description: '',
  avatar: '🔎',
  backgroundColor: '#316049',
  mention: 'websuche',
  ...overrides,
});

describe('computePillMentionInsertion', () => {
  it('strips the typed trigger span and inserts nothing without a template', () => {
    const { newText, cursorPosition } = computePillMentionInsertion(
      'hallo @websu welt',
      mentionable({}),
      6,
      12
    );
    expect(newText).toBe('hallo  welt');
    expect(cursorPosition).toBe(6);
  });

  it('keeps only the promptTemplate in the draft', () => {
    const { newText, cursorPosition } = computePillMentionInsertion(
      '@shar',
      mentionable({ promptTemplate: 'Erstelle ein Sharepic zu ' }),
      0,
      5
    );
    expect(newText).toBe('Erstelle ein Sharepic zu ');
    expect(cursorPosition).toBe(newText.length);
  });

  it('drops the promptTemplate of a recipe — the chip already says it', () => {
    const { newText, cursorPosition } = computePillMentionInsertion(
      '@pm-hes',
      mentionable({
        category: 'skill',
        mention: 'presse-hessen-partei',
        promptTemplate: 'Schreibe eine Pressemitteilung im Stil Grüne Hessen zum Thema: ',
      }),
      0,
      7
    );
    expect(newText).toBe('');
    expect(cursorPosition).toBe(0);
  });

  it('appends at the end when no trigger was typed (plus-menu path)', () => {
    const { newText, cursorPosition } = computePillMentionInsertion(
      'schon getippt',
      mentionable({}),
      -1,
      13
    );
    expect(newText).toBe('schon getippt');
    expect(cursorPosition).toBe(13);
  });
});

describe('buildMentionPrefix', () => {
  it('emits a durable mcp token for a connector pill', () => {
    const prefix = buildMentionPrefix([
      mentionable({ identifier: 'mcp:fb75887f-bf1c-4369', title: 'Tally', mention: 'tally' }),
    ]);
    expect(prefix).toBe('@[Tally](mcp:fb75887f-bf1c-4369)');
  });

  it('renders as a chip — the whole point of the token form', () => {
    const prefix = buildMentionPrefix([
      mentionable({ identifier: 'mcp:fb75887f-bf1c-4369', title: 'Tally', mention: 'tally' }),
    ]);
    expect(parseMentionTokens(prefix)).toEqual([
      expect.objectContaining({ type: 'mcp', id: 'fb75887f-bf1c-4369', label: 'Tally' }),
    ]);
  });

  it('tokenises tools and notebooks, joined by a space', () => {
    expect(
      buildMentionPrefix([
        mentionable({}),
        mentionable({ type: 'notebook', identifier: 'klima-berlin', title: 'Klima' }),
      ])
    ).toBe('@[Websuche](tool:websearch) @[Klima](notebook:klima-berlin)');
  });

  it('keeps the plain form for recipes — the skill token carries no agent', () => {
    expect(
      buildMentionPrefix([
        mentionable({ type: 'agent', category: 'skill', title: 'Presse', mention: 'presse' }),
        mentionable({ type: 'textform', category: 'skill', title: 'Grüße', mention: 'gruesse' }),
      ])
    ).toBe('@presse @gruesse');
  });
});

describe('computeMentionInsertion', () => {
  it('writes only the @-token for a recipe, no promptTemplate', () => {
    const { newText } = computeMentionInsertion(
      '',
      mentionable({
        category: 'skill',
        mention: 'presse-hessen-partei',
        promptTemplate: 'Schreibe eine Pressemitteilung im Stil Grüne Hessen zum Thema: ',
      }),
      -1,
      0
    );
    expect(newText).toBe('@presse-hessen-partei ');
  });

  it('keeps the query stem of a tool mention', () => {
    const { newText } = computeMentionInsertion(
      '',
      mentionable({ mention: 'umfragen', promptTemplate: 'Suche aktuelle Umfragen zu ' }),
      -1,
      0
    );
    expect(newText).toBe('@umfragen Suche aktuelle Umfragen zu ');
  });
});
