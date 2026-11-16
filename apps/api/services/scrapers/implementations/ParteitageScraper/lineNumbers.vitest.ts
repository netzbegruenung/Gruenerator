import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { numberedSectionsOf, withLineNumbers } from './lineNumbers.js';

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

// Beschluss V-02 der LDK Troisdorf 2026: Seite und API-Antwort vom 16.11.2026.
const page = fixture('page-beschluss-v02-zeilen.html');
const api = JSON.parse(fixture('beschluss-v02-zeilen.json')) as {
  sections: Array<{ html: string }>;
};

describe('numberedSectionsOf', () => {
  it('liest Absätze mit ihren Zeilen, ohne Notiz-Knöpfe und weiche Umbrüche', () => {
    const [section] = numberedSectionsOf(page);
    expect(section.paragraphs.slice(0, 2).map((p) => [p.from, p.to])).toEqual([
      [1, 2],
      [3, 8],
    ]);
    const all = section.paragraphs.map((p) => p.text).join(' ');
    expect(all).not.toContain('Private Notiz');
    expect(all).not.toContain('\n'.repeat(1) + 'Organspende aus.');
    expect(section.paragraphs.at(-1)!.to).toBe(28);
  });
});

describe('withLineNumbers', () => {
  it('setzt die Zeilenmarken, wenn die Seite denselben Text trägt', () => {
    const text = withLineNumbers(api.sections[0].html, numberedSectionsOf(page));
    expect(text).toMatch(/^\[Z\. 1–2\] BÜNDNIS 90\/DIE GRÜNEN NRW spricht sich ausdrücklich/);
    expect(text).toContain('\n\n[Z. 3–8] Die Landesdelegiertenkonferenz bekräftigt');
  });

  it('nimmt die Seite nicht, wenn ihr Text abweicht (andere Fassung)', () => {
    expect(withLineNumbers('<p>Ein ganz anderer Text.</p>', numberedSectionsOf(page))).toBeNull();
  });

  it('lässt eine Überschrift ohne Marke, damit sie Überschrift bleibt', () => {
    const html =
      '<section class="motionTextHolder"><h2>Antragstext</h2><div class="paragraph lineNumbers"><div class="text">' +
      '<h4><span class="lineNumber" data-line-number="1"></span>Titel</h4></div></div>' +
      '<div class="paragraph lineNumbers"><div class="text"><p><span class="lineNumber" data-line-number="2"></span>Satz eins <br><span class="lineNumber" data-line-number="3"></span>geht weiter.</p></div></div></section>';
    expect(
      withLineNumbers('<h4>Titel</h4><p>Satz eins geht weiter.</p>', numberedSectionsOf(html))
    ).toBe('#### Titel\n\n[Z. 2–3] Satz eins geht weiter.');
  });
});
