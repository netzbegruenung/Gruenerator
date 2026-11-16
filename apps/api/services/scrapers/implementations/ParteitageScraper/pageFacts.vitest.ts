/**
 * Die Fixtures sind die Datentabellen echter Seiten (gruene-nrw.antragsgruen.de,
 * 15.11.2026): V-07 der LDK Troisdorf hat drei Versionen — den eingereichten
 * Antrag, einen Zwischenstand mit Status „Beschluss" (29.06.) und den
 * endgültigen Beschluss (21.06.), textgleich mit dem Zwischenstand.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { germanDateToIso, pageFactsOf, versionRoleOf } from './pageFacts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = (name: string) => fs.readFileSync(path.join(here, '__fixtures__', name), 'utf8');

describe('pageFactsOf', () => {
  it('liest Beschlussdatum, Gremium und Versionskette eines Beschlusses', () => {
    expect(pageFactsOf(page('page-beschluss-v07-version3.html'))).toEqual({
      eingereichtAm: null,
      beschlossenAm: '2026-06-21',
      beschlussDurch: 'Landesdelegiertenkonferenz',
      // „20./21. Juni 2026" — zwei Tage, also kein Datum.
      veranstaltungAm: null,
      version: 3,
      otherVersions: [
        { version: 1, motionId: 101856 },
        { version: 2, motionId: 103905 },
      ],
      // Die gekürzte Fixture enthält keinen Antragstext.
      numbered: [],
    });
  });

  it('liest das Einreichungsdatum, das die API nicht liefert', () => {
    const facts = pageFactsOf(page('page-aenderungsantrag-ohne-datum.html'));
    expect(facts.eingereichtAm).toMatch(/^2026-\d{2}-\d{2}$/);
    expect(facts.version).toBeNull();
  });

  it('liefert leere Felder statt eines Fehlers, wenn die Tabelle fehlt', () => {
    expect(pageFactsOf('<html><body>Wartungsarbeiten</body></html>')).toEqual({
      eingereichtAm: null,
      beschlossenAm: null,
      beschlussDurch: null,
      veranstaltungAm: null,
      version: null,
      otherVersions: [],
      numbered: [],
    });
  });

  it('nimmt ein eintägiges Veranstaltungsdatum und lässt einen Personennamen als Gremium weg', () => {
    // Landesparteirat Schwerte 2026, V-01 (16.11.2026): kein „Beschlossen am",
    // unter „Beschluss durch" ein Personenname.
    const html = `<table class="motionDataTable">
      <tr><th scope="row">Veranstaltung:</th><td><a href="/lpr26">Landesparteirat GRÜNE NRW Schwerte 22. März 2026</a></td></tr>
      <tr class="statusRow"><th scope="row">Status:</th><td>Beschluss</td></tr>
      <tr><th scope="row">Beschluss durch:</th><td>Erika Beispiel</td></tr>
      <tr><th scope="row">Eingereicht:</th><td>17.02.2026, 10:52</td></tr>
    </table>`;
    expect(pageFactsOf(html)).toMatchObject({
      veranstaltungAm: '2026-03-22',
      beschlossenAm: null,
      beschlussDurch: null,
      eingereichtAm: '2026-02-17',
    });
  });
});

describe('versionRoleOf', () => {
  it('nimmt die neueste Version als gültige und lässt den Zwischenstand weg', () => {
    expect(versionRoleOf(pageFactsOf(page('page-beschluss-v07-version3.html')))).toEqual({
      role: 'current',
    });
    expect(versionRoleOf(pageFactsOf(page('page-beschluss-v07-version2.html')))).toEqual({
      role: 'superseded',
      newestMotionId: 103910,
    });
  });

  it('behält Version 1 als eingereichte Fassung mit Verweis auf die neueste', () => {
    expect(
      versionRoleOf({
        version: 1,
        otherVersions: [
          { version: 2, motionId: 103905 },
          { version: 3, motionId: 103910 },
        ],
      })
    ).toEqual({ role: 'original', newestMotionId: 103910 });
  });

  it('behandelt einen Antrag ohne Historie als gültig', () => {
    expect(versionRoleOf({ version: null, otherVersions: [] })).toEqual({ role: 'current' });
  });
});

describe('germanDateToIso', () => {
  it('liest Datum mit und ohne Uhrzeit', () => {
    expect(germanDateToIso('04.06.2026, 12:29')).toBe('2026-06-04');
    expect(germanDateToIso('1.6.2026')).toBe('2026-06-01');
    expect(germanDateToIso('kein Datum')).toBeNull();
  });
});
