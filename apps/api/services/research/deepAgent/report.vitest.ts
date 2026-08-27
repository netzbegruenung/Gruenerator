import { describe, expect, it } from 'vitest';

import {
  ensureSources,
  extractTitle,
  isUsableReport,
  markPartial,
  readFile,
  stripInternalReferences,
  summaryFromReport,
} from './report.js';

describe('readFile', () => {
  it('reads the v1 line-array shape', () => {
    const files = { '/bericht.md': { content: ['# Titel', '', 'Text'] } };
    expect(readFile(files, '/bericht.md')).toBe('# Titel\n\nText');
  });

  it('reads the v2 plain-string shape', () => {
    expect(readFile({ '/bericht.md': { content: '# Titel' } }, '/bericht.md')).toBe('# Titel');
  });

  it('returns null for a missing file or a non-object state', () => {
    expect(readFile({}, '/bericht.md')).toBeNull();
    expect(readFile(null, '/bericht.md')).toBeNull();
    expect(readFile(undefined, '/bericht.md')).toBeNull();
  });
});

describe('extractTitle', () => {
  it('prefers the H1', () => {
    expect(extractTitle('# Wiens Klimaziel\n\nText', 'egal')).toBe('Wiens Klimaziel');
  });

  it('falls back to the first non-empty line, without its hashes', () => {
    expect(extractTitle('\n\n## Zusammenfassung\nText', 'egal')).toBe('Zusammenfassung');
  });

  it('falls back to the supplied default when there is no text at all', () => {
    expect(extractTitle('   \n  ', 'Die Frage')).toBe('Die Frage');
  });
});

describe('ensureSources', () => {
  const sources = [
    { url: 'https://a.example/1', title: 'A' },
    { url: 'https://b.example/2', title: 'B' },
  ];

  it('leaves a report that already has a Quellen section alone', () => {
    const md = '# T\n\nText\n\n## Quellen\n\n1. A — https://a.example/1\n';
    expect(ensureSources(md, sources)).toBe(md);
  });

  it('appends a numbered list when the section is missing', () => {
    const out = ensureSources('# T\n\nText', sources);
    expect(out).toContain('## Quellen');
    expect(out).toContain('1. A — https://a.example/1');
    expect(out).toContain('2. B — https://b.example/2');
  });

  it('does not append an empty section when nothing was collected', () => {
    expect(ensureSources('# T\n\nText', [])).toBe('# T\n\nText');
  });

  /**
   * A document inside a personal notebook has no public address. Naming its
   * origin is the honest rendering — a line ending in a bare em-dash reads as a
   * lost link, and an invented `/office/…` path would be a dead one.
   */
  it('names the origin of a source that has no URL', () => {
    const out = ensureSources('# T\n\nText', [
      { url: '', title: 'Beschluss 2026', origin: 'Notebook: Berlin' },
    ]);
    expect(out).toContain('1. Beschluss 2026 — Notebook: Berlin');
  });

  it('falls back to a neutral origin when even that is missing', () => {
    const out = ensureSources('# T\n\nText', [{ url: '', title: 'Notiz' }]);
    expect(out).toContain('1. Notiz — Grünerator-Notebook');
  });
});

describe('markPartial', () => {
  it('puts the warning after the H1 so the document still opens with its title', () => {
    const out = markPartial('# Titel\n\nText');
    expect(out.startsWith('# Titel\n')).toBe(true);
    expect(out).toContain('Unvollständiger Bericht');
  });

  it('prepends the warning when there is no H1', () => {
    expect(markPartial('Text').startsWith('>')).toBe(true);
  });
});

describe('isUsableReport', () => {
  it('rejects null, empty and stub-length content', () => {
    expect(isUsableReport(null)).toBe(false);
    expect(isUsableReport('')).toBe(false);
    expect(isUsableReport('# Titel\n\nZu kurz.')).toBe(false);
  });

  it('accepts a report of real length', () => {
    expect(isUsableReport(`# Titel\n\n${'Text. '.repeat(100)}`)).toBe(true);
  });
});

describe('stripInternalReferences', () => {
  it('drops the paragraph that names the agent’s virtual report file', () => {
    const out = stripInternalReferences(
      'Wien ist ambitioniert.\n\nDer vollständige Bericht steht in der Datei `/bericht.md`.'
    );
    expect(out).toBe('Wien ist ambitioniert.');
  });

  it('drops paragraphs naming the agent’s own tools', () => {
    expect(stripInternalReferences('Fertig.\n\nIch habe write_file benutzt.')).toBe('Fertig.');
  });

  it('leaves ordinary prose untouched', () => {
    const text = 'Wien will 2040 klimaneutral sein.\n\nDie Kritik richtet sich auf das Tempo.';
    expect(stripInternalReferences(text)).toBe(text);
  });
});

describe('summaryFromReport', () => {
  it('returns the Zusammenfassung paragraph without markdown bold', () => {
    const md =
      '# T\n\n## Zusammenfassung\nWien will **2040** klimaneutral sein.\n\n## Details\nEgal.';
    expect(summaryFromReport(md)).toBe('Wien will 2040 klimaneutral sein.');
  });

  it('returns null when the report has no summary section', () => {
    expect(summaryFromReport('# T\n\n## Details\nEgal.')).toBeNull();
  });

  it('cuts long summaries on a sentence boundary', () => {
    const long = `${'Ein ganzer Satz über Wien. '.repeat(40)}`;
    const out = summaryFromReport(`## Zusammenfassung\n${long}`, 300);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(300);
    expect(out!.endsWith('.')).toBe(true);
  });
});
