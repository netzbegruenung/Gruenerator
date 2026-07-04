import { type Slide } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { renderDeckToPandocMarkdown, sanitizeFilename } from './presentationPptxExport.js';

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
