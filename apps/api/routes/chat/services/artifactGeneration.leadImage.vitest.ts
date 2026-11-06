import { describe, expect, it } from 'vitest';

import { withLeadImage } from './artifactGeneration.js';

// Ein Bild aus dem Gespräch im Dokument (06.11.2026).
describe('withLeadImage', () => {
  const URL = '/api/share/abcdefghijklmnop1234/download';

  it('sets the image under the first heading', () => {
    expect(withLeadImage('<h1>Blühwiesen</h1><p>Text</p>', URL)).toBe(
      `<h1>Blühwiesen</h1><img src="${URL}" alt="KI-generiertes Bild"><p>Text</p>`
    );
  });

  it('sets it at the top of a document without a heading, also from markdown', () => {
    expect(withLeadImage('<p>Text</p>', URL)).toMatch(
      /^<img src="[^"]+" alt="KI-generiertes Bild"><p>Text<\/p>/
    );
    expect(withLeadImage('# Blühwiesen\n\nText', URL)).toMatch(/<\/h1><img /);
  });

  it('keeps the address inside its attribute', () => {
    expect(withLeadImage('<p>x</p>', '/a"onerror="x')).toContain('src="/a&quot;onerror=&quot;x"');
  });
});
