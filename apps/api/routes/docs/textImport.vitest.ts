import { describe, expect, it } from 'vitest';

import { textBufferToHtml, textImportKind } from './textImport.js';

describe('textImportKind', () => {
  it.each([
    ['notiz.txt', 'plain'],
    ['README.md', 'markdown'],
    ['Beschluss.MD', 'markdown'],
    ['a.b.markdown', 'markdown'],
  ])('erkennt %s als %s', (name, kind) => {
    expect(textImportKind(name)).toBe(kind);
  });

  it.each(['antrag.docx', 'scan.pdf', 'ohneendung', 'txt', 'archiv.md.zip'])(
    'lässt %s dem OCR-Pfad',
    (name) => {
      expect(textImportKind(name)).toBeNull();
    }
  );
});

describe('textBufferToHtml', () => {
  const buf = (s: string) => Buffer.from(s, 'utf8');

  it('macht aus Markdown Überschriften und Listen', () => {
    const html = textBufferToHtml(buf('# Titel\n\n- eins\n- zwei'), 'markdown');
    expect(html).toContain('<h1>Titel</h1>');
    expect(html).toContain('<li>eins</li>');
  });

  it('deutet Klartext nicht als Markdown und maskiert HTML', () => {
    const html = textBufferToHtml(buf('# kein Titel\n*nicht kursiv* <b>x</b> & Co'), 'plain');
    expect(html).toBe('<p># kein Titel<br>*nicht kursiv* &lt;b&gt;x&lt;/b&gt; &amp; Co</p>');
  });

  it('teilt Klartext an Leerzeilen in Absätze und normalisiert CRLF', () => {
    expect(textBufferToHtml(buf('a\r\n\r\nb\r\nc'), 'plain')).toBe('<p>a</p><p>b<br>c</p>');
  });

  it('entfernt die UTF-8-BOM und behält Umlaute', () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buf('Grüne Größe')]);
    expect(textBufferToHtml(withBom, 'plain')).toBe('<p>Grüne Größe</p>');
  });

  it.each(['markdown', 'plain'] as const)(
    'liefert für leere %s-Dateien einen leeren String',
    (kind) => {
      expect(textBufferToHtml(buf('  \n\n '), kind)).toBe('');
    }
  );
});
