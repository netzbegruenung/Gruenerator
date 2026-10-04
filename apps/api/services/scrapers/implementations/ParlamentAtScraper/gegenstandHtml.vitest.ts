import { describe, expect, it } from 'vitest';

import { gegenstandText } from './gegenstandHtml.js';

// Gekürzt nach XXVIII/I/212 (Erläuterungen) bzw. XXVIII/J/100: Word-Export mit
// CSS im Kopf, Überschriften als Formatvorlagen, Umbrüche mitten im Absatz.
const ERLAEUTERUNGEN = `<html><head><style><!-- p.MsoNormal {margin:0pt;} --></style></head>
<body lang=DE-AT><div class=WordSection1>
<p class=81ErlUeberschrZ>Erl&auml;uterungen</p>
<p class=82ErlUeberschrL>Hauptgesichtspunkte des Entwurfs:</p>
<p class=83ErlText>Arbeitsverh&auml;ltnisse haben die Erbringung von
Arbeitsleistungen gegen Entgelt zum Inhalt.</p>
<p class=83ErlText>Der freie Dienstvertrag ist im Arbeitsrecht gesetzlich nicht
geregelt.</p>
</div></body></html>`;

const ANFRAGE = `<html><head><style>h1 {font-size:20pt;}</style></head><body>
<p class=MsoNormal>100/J XXVIII. GP</p>
<p class=MsoNormal>Eingelangt am 20.11.2024</p>
<p class=MsoNormal>Dieser Text wurde elektronisch übermittelt. Abweichungen vom Original sind möglich.</p>
<p class=MsoNormal>ANFRAGE</p>
</body></html>`;

describe('gegenstandText', () => {
  it('macht Formatvorlagen-Überschriften zu #-Zeilen und Absätze zu Absätzen', () => {
    expect(gegenstandText(ERLAEUTERUNGEN)).toBe(
      '## Erläuterungen\n\n## Hauptgesichtspunkte des Entwurfs:\n\n' +
        'Arbeitsverhältnisse haben die Erbringung von Arbeitsleistungen gegen Entgelt zum Inhalt.\n\n' +
        'Der freie Dienstvertrag ist im Arbeitsrecht gesetzlich nicht geregelt.'
    );
  });

  it('lässt CSS und den Übermittlungshinweis weg', () => {
    const text = gegenstandText(ANFRAGE);
    expect(text).not.toContain('font-size');
    expect(text).not.toContain('elektronisch');
    expect(text).toContain('ANFRAGE');
  });
});
