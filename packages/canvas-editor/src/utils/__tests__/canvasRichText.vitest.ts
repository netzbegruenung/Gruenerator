/**
 * Flacher Feldtext ⇄ `RichTextDoc` für den tiptap-Editor.
 *
 * Die Hin- und Rückrichtung müssen sich auf normalisiertem Text aufheben —
 * sonst schriebe jeder Tastendruck im Editor eine andere Form in den Zustand,
 * und die Versionshistorie füllte sich mit Nicht-Änderungen.
 */
import { describe, it, expect } from 'vitest';

import {
  markdownLiteToRichText,
  richTextMarkSchema,
  richTextToMarkdownLite,
} from '@gruenerator/contracts';

import type { RichTextDoc } from '@gruenerator/contracts';

describe('markdownLiteToRichText', () => {
  it('macht aus jeder Zeile einen Absatz und aus Läufen Textknoten mit Marks', () => {
    expect(markdownLiteToRichText('a **b**\nc')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a ' },
            { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'c' }] },
      ],
    });
  });

  it('fasst zusammenhängende Markerzeilen zu einer Liste zusammen', () => {
    const doc = markdownLiteToRichText('Intro\n• a\n• b\n1. c\n2. d');
    expect(doc.content?.map((node) => node.type)).toEqual([
      'paragraph',
      'bulletList',
      'orderedList',
    ]);
    expect(doc.content?.[1]?.content).toHaveLength(2);
    expect(doc.content?.[1]?.content?.[0]).toEqual({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
    });
  });

  it('hält eine einzelne Ziffernzeile für ein Datum, nicht für eine Liste', () => {
    const doc = markdownLiteToRichText('1. Mai Demo');
    expect(doc.content?.[0]?.type).toBe('paragraph');
  });

  it('liefert für leeren Text einen leeren Absatz', () => {
    expect(markdownLiteToRichText('')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
  });
});

describe('richTextToMarkdownLite', () => {
  it('ist auf normalisiertem Text die Umkehrung', () => {
    for (const text of [
      'a **b** _c_ <u>d</u>',
      'Intro\n• a\n• **b** c\n1. d\n2. e\nSchluss',
      '',
      'a\n\nb',
    ]) {
      expect(richTextToMarkdownLite(markdownLiteToRichText(text))).toBe(text);
    }
  });

  it('nummeriert eine Liste ab ihrem Startwert', () => {
    const doc: RichTextDoc = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'y' }] }],
            },
          ],
        },
      ],
    };
    expect(richTextToMarkdownLite(doc)).toBe('3. x\n4. y');
  });

  it('macht aus einem harten Umbruch im Absatz eine Zeile', () => {
    const doc: RichTextDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a' },
            { type: 'hardBreak' },
            { type: 'text', text: 'b' },
          ],
        },
      ],
    };
    expect(richTextToMarkdownLite(doc)).toBe('a\nb');
  });

  it('hält einen Listenpunkt mit zwei Absätzen auf einer Zeile', () => {
    // Sonst läse die zweite Zeile beim nächsten Parsen als Prosa und der
    // Punkt zerfiele.
    const doc: RichTextDoc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
              ],
            },
          ],
        },
      ],
    };
    expect(richTextToMarkdownLite(doc)).toBe('• a b');
  });
});

describe('Akzent im Rich Text', () => {
  it('wird zur accent-Mark und zurück', () => {
    const doc = markdownLiteToRichText('Das ist ==ungerecht.==');
    expect(doc.content?.[0]?.content?.[1]).toEqual({
      type: 'text',
      text: 'ungerecht.',
      marks: [{ type: 'accent' }],
    });
    expect(richTextToMarkdownLite(doc)).toBe('Das ist ==ungerecht.==');
  });

  it('bleibt beim Canvas: Site-Inhalte dürfen die Mark nicht speichern', () => {
    // Die Site-Renderer haben keine Extension dafür; ein gespeicherter Akzent
    // ließe die öffentliche Seite beim Rendern scheitern.
    expect(richTextMarkSchema.safeParse({ type: 'accent' }).success).toBe(false);
    expect(richTextMarkSchema.safeParse({ type: 'bold' }).success).toBe(true);
  });
});

describe('Marker im Rich Text', () => {
  it('wird zur marker-Mark und zurück, auch gemeinsam mit Akzent', () => {
    const doc = markdownLiteToRichText('Das ist ++ungerecht.++');
    expect(doc.content?.[0]?.content?.[1]).toEqual({
      type: 'text',
      text: 'ungerecht.',
      marks: [{ type: 'marker' }],
    });
    expect(richTextToMarkdownLite(doc)).toBe('Das ist ++ungerecht.++');
    const both = markdownLiteToRichText('++a ==b== c++');
    expect(richTextToMarkdownLite(both)).toBe('++a ==b== c++');
  });
});
