import { describe, expect, it } from 'vitest';

import {
  adfToText,
  buildTextCql,
  buildTextJql,
  escapeQueryString,
  quoteQueryValue,
  sanitizeSearchPhrase,
} from './atlassianText.js';

describe('escapeQueryString', () => {
  it('escapes backslash and double quote', () => {
    expect(escapeQueryString('a"b\\c')).toBe('a\\"b\\\\c');
  });

  it('cannot break out of the quoted string', () => {
    const jql = buildTextJql('x" OR project = SECRET OR text ~ "y');
    expect(jql).toBe('text ~ "x\\" OR project = SECRET OR text \\"y" ORDER BY updated DESC');
    // every remaining quote inside the literal is escaped
    const literal = /text ~ "(.*)" ORDER/.exec(jql ?? '')?.[1] ?? '';
    expect(literal.replace(/\\"/g, '')).not.toContain('"');
  });

  it('folds newlines to a space', () => {
    expect(escapeQueryString('a\nb')).toBe('a b');
  });
});

describe('query builders', () => {
  it('builds text JQL, restricted to a project when given', () => {
    expect(buildTextJql('Wahlkampf Plakat', 'WK')).toBe(
      'project = "WK" AND text ~ "Wahlkampf Plakat" ORDER BY updated DESC'
    );
  });

  it('returns null when nothing searchable is left', () => {
    expect(buildTextJql('  +-*  ')).toBeNull();
    expect(buildTextCql('')).toBeNull();
  });

  it('strips text-index operators', () => {
    expect(sanitizeSearchPhrase('foo* (bar) -baz')).toBe('foo bar baz');
  });

  it('builds page CQL with optional space', () => {
    expect(buildTextCql('Satzung', 'DOC')).toBe(
      'type = page AND text ~ "Satzung" AND space = "DOC"'
    );
    expect(buildTextCql('Satzung')).toBe('type = page AND text ~ "Satzung"');
  });

  it('quotes values', () => {
    expect(quoteQueryValue('A"B')).toBe('"A\\"B"');
  });
});

describe('adfToText', () => {
  const doc = (...content: unknown[]) => ({ type: 'doc', version: 1, content });
  const p = (...content: unknown[]) => ({ type: 'paragraph', content });
  const t = (text: string) => ({ type: 'text', text });

  it('joins paragraphs with newlines', () => {
    expect(adfToText(doc(p(t('Eins')), p(t('Zwei'))))).toBe('Eins\nZwei');
  });

  it('renders headings with hashes', () => {
    expect(adfToText(doc({ type: 'heading', attrs: { level: 2 }, content: [t('Titel')] }))).toBe(
      '## Titel'
    );
  });

  it('renders bullet and ordered lists, nested', () => {
    const list = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            p(t('a')),
            { type: 'orderedList', content: [{ type: 'listItem', content: [p(t('a1'))] }] },
          ],
        },
        { type: 'listItem', content: [p(t('b'))] },
      ],
    };
    expect(adfToText(doc(list))).toBe('- a\n  1. a1\n- b');
  });

  it('renders mentions, hardBreak and inline cards', () => {
    expect(
      adfToText(
        doc(
          p(
            t('Hi '),
            { type: 'mention', attrs: { id: '1', text: '@Anna' } },
            { type: 'hardBreak' },
            { type: 'inlineCard', attrs: { url: 'https://x.test' } }
          )
        )
      )
    ).toBe('Hi @Anna\nhttps://x.test');
  });

  it('renders code blocks fenced', () => {
    expect(adfToText(doc({ type: 'codeBlock', content: [t('const a = 1;')] }))).toBe(
      '```\nconst a = 1;\n```'
    );
  });

  it('renders tables row by row', () => {
    const cell = (s: string) => ({ type: 'tableCell', content: [p(t(s))] });
    expect(
      adfToText(
        doc({ type: 'table', content: [{ type: 'tableRow', content: [cell('A'), cell('B')] }] })
      )
    ).toBe('A | B');
  });

  it('passes strings through and survives garbage', () => {
    expect(adfToText('plain')).toBe('plain');
    expect(adfToText(null)).toBe('');
    expect(adfToText({ type: 'doc' })).toBe('');
  });
});
