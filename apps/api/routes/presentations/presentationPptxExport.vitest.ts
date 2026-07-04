import { type Slide } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  asciiFilename,
  contentDispositionAttachment,
  renderDeckToPandocMarkdown,
  sanitizeFilename,
} from './presentationPptxExport.js';

function slide(partial: Partial<Slide>): Slide {
  return {
    id: 'x',
    layout: 'content',
    title: '',
    body: '',
    notes: '',
    background: null,
    transition: null,
    fragments: false,
    autoAnimate: false,
    hidden: false,
    codeLanguage: null,
    ...partial,
  };
}

describe('renderDeckToPandocMarkdown', () => {
  it('renders one level-2 heading per visible slide', () => {
    const md = renderDeckToPandocMarkdown(
      [
        slide({ layout: 'title', title: 'Deck', body: 'Untertitel' }),
        slide({ title: 'Punkte', body: '- a\n- b' }),
      ],
      'Meine Präsentation'
    );
    expect(md).toContain('% Meine Präsentation');
    expect(md).toContain('## Deck');
    expect(md).toContain('## Punkte');
    expect(md).toContain('- a\n- b');
  });

  it('omits hidden slides', () => {
    const md = renderDeckToPandocMarkdown(
      [slide({ title: 'Sichtbar' }), slide({ title: 'Versteckt', hidden: true })],
      'T'
    );
    expect(md).toContain('## Sichtbar');
    expect(md).not.toContain('## Versteckt');
  });

  it('renders code slides as fenced blocks with the language', () => {
    const md = renderDeckToPandocMarkdown(
      [
        slide({
          layout: 'code',
          title: 'Beispiel',
          body: 'const x = 1;',
          codeLanguage: 'typescript',
        }),
      ],
      'T'
    );
    expect(md).toContain('```typescript\nconst x = 1;\n```');
  });

  it('renders speaker notes as a pandoc notes div', () => {
    const md = renderDeckToPandocMarkdown([slide({ title: 'A', notes: 'Kontext' })], 'T');
    expect(md).toContain('::: notes\nKontext\n:::');
  });

  it('strips markdown image embeds (pandoc would fail on missing files) but keeps alt text', () => {
    const md = renderDeckToPandocMarkdown(
      [slide({ title: 'A', body: '![Radweg](/images/missing.jpg)\n\n- Punkt' })],
      'T'
    );
    expect(md).not.toContain('/images/missing.jpg');
    expect(md).not.toContain('![');
    expect(md).toContain('Radweg');
    expect(md).toContain('- Punkt');
  });
});

describe('sanitizeFilename', () => {
  it('strips unsafe characters and keeps letters/numbers', () => {
    expect(sanitizeFilename('Klima: 2035 / Plan"')).toBe('Klima 2035  Plan');
  });
  it('falls back when empty', () => {
    expect(sanitizeFilename('///')).toBe('Praesentation');
  });
});

describe('asciiFilename / contentDispositionAttachment', () => {
  it('transliterates umlauts to ASCII', () => {
    expect(asciiFilename('Präsentation über Radwege')).toBe('Praesentation ueber Radwege');
  });
  it('builds an ASCII filename plus a UTF-8 filename* for umlaut titles', () => {
    const header = contentDispositionAttachment('Präsentation über Radwege');
    expect(header).toContain('filename="Praesentation ueber Radwege.pptx"');
    expect(header).toContain("filename*=UTF-8''");
    // ASCII token must not carry raw non-ASCII bytes.
    // eslint-disable-next-line no-control-regex
    const asciiToken = header.match(/filename="([^"]*)"/)?.[1] ?? '';
    expect(/^[\x20-\x7E]*$/.test(asciiToken)).toBe(true);
  });
});
