/**
 * Antragsgrün → Dokument des Notebooks „Parteitage".
 *
 * Die beiden Fixtures sind echte Antworten der öffentlichen REST-API von
 * gruene-nrw.antragsgruen.de (abgerufen am 15.11.2026), damit die Zod-Schemas
 * gegen die echte Form laufen und nicht gegen eine nachgebaute: der Beschluss
 * V-06 der LDK Troisdorf und ein Änderungsantrag der Grünen Jugend zum
 * Wahlprogramm der LDK Essen, beide von Organisationen gestellt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  amendmentSchema,
  motionSchema,
  type AmendmentLink,
  type ConsultationRef,
  type MotionLink,
} from './antragsgruenClient.js';
import {
  amendmentUnitOf,
  initiatorNames,
  isCandidacy,
  markDiff,
  motionUnitOf,
  parteitagLabelOf,
  plainText,
} from './builders.js';
import { ANTRAGSGRUEN_INSTANCES } from './instances.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(here, '__fixtures__', name), 'utf8')) as Record<
    string,
    unknown
  >;

const instance = ANTRAGSGRUEN_INSTANCES[0];
const troisdorf: ConsultationRef = {
  title: 'Landesdelegiertenkonferenz Troisdorf',
  title_short: 'LDK Troisdorf',
  date_published: '2026-04-16T10:00:00+02:00',
  url_path: 'ldk26',
  url_json: 'https://gruene-nrw.antragsgruen.de/rest/ldk26',
  url_html: 'https://gruene-nrw.antragsgruen.de/ldk26',
};
const essen: ConsultationRef = {
  ...troisdorf,
  title: 'Landesdelegiertenkonferenz 13.-15. November Essen',
  title_short: 'LDK Essen',
  date_published: '2026-08-20T09:00:00+02:00',
  url_path: 'ldk26-02',
};

describe('motionUnitOf', () => {
  const raw = fixture('beschluss-v06.json');
  const motion = motionSchema.parse(raw.motion);
  const link = raw.link as MotionLink;
  const unit = motionUnitOf(motion, link, { instance, consultation: troisdorf });

  it('liest den Beschluss als Beschluss, nicht als Antrag', () => {
    expect(unit.payload.content_type).toBe('beschluss');
    expect(unit.payload.status).toBe('Beschluss');
  });

  it('trägt die Filterfelder für den Parteitag', () => {
    expect(unit.payload).toMatchObject({
      document_id: `ag-nrw-m${motion.id}`,
      landesverband: 'NRW',
      parteitag: 'LDK Troisdorf (2026)',
      parteitag_id: 'nrw/ldk26',
      kuerzel: 'V-06',
      antragsteller: ['Landesdelegiertenkonferenz'],
      source: 'parteitage',
    });
    expect(unit.payload.tagesordnungspunkt).toBe(motion.agenda_item?.trim());
  });

  it('beginnt mit einem kurzen Kopf und hält die Abschnitte als Überschriften', () => {
    const [header] = unit.text.split('\n\n## ');
    expect(unit.text.startsWith(`# ${motion.title_with_prefix}\n\nBeschluss · `)).toBe(true);
    // Die NLP-Anreicherung liest nur die ersten 1500 Zeichen.
    expect(header.length).toBeLessThan(500);
    expect(unit.text).toContain('\n\n## Antragstext\n\n');
  });

  it('bleibt bei gleichem Text gleich und ändert den Hash bei neuem Text', () => {
    const again = motionUnitOf(motion, link, { instance, consultation: troisdorf });
    expect(again.payload.content_hash).toBe(unit.payload.content_hash);
    const edited = motionSchema.parse({
      ...motion,
      sections: [{ type: 'TextSimple', title: 'Antragstext', html: '<p>Neu.</p>' }],
    });
    expect(
      motionUnitOf(edited, link, { instance, consultation: troisdorf }).payload.content_hash
    ).not.toBe(unit.payload.content_hash);
  });
});

describe('amendmentUnitOf', () => {
  const raw = fixture('aenderungsantrag-110621.json');
  const amendment = amendmentSchema.parse(raw.amendment);
  const unit = amendmentUnitOf(amendment, raw.link as AmendmentLink, {
    instance,
    consultation: essen,
  });

  it('nennt den Antrag, zu dem er gehört', () => {
    expect(unit.title).toBe(
      'Änderungsantrag WP-01-000 zu WP-01: Ein Land der Innovation und Nachhaltigkeit'
    );
    expect(unit.payload).toMatchObject({
      content_type: 'aenderungsantrag',
      antrag_id: `ag-nrw-m${amendment.motion.id}`,
      antrag_kuerzel: 'WP-01',
      antragsteller: ['GRÜNE JUGEND NRW'],
      status: 'Geprüft',
      parteitag: 'LDK Essen (2026)',
    });
  });

  it('übernimmt das Votum der Antragskommission samt Text', () => {
    expect(unit.payload.votum).toBe('Modifizierte Übernahme');
    expect(unit.text).toContain('Votum der Antragskommission: Modifizierte Übernahme');
    expect(unit.text).toContain('## Verfahrensvorschlag der Antragskommission');
  });

  it('macht Einfügungen im Text als solche lesbar', () => {
    expect(unit.text).toContain('#### Vor Zeile 1 einfügen:');
    expect(unit.text).toContain('[eingefügt: Innovation und Wirtschaftspolitik');
  });
});

describe('markDiff', () => {
  it('markiert eingefügten und gestrichenen Text, inline wie als Absatz', () => {
    const html =
      '<p>Wir wollen <del>wenig</del><ins>mehr</ins> Radwege.</p><p class="deleted">Alter Satz.</p><p class="inserted">Neuer Satz.</p>';
    expect(markDiff(html)).toBe(
      '<p>Wir wollen <del>[gestrichen: wenig]</del><ins>[eingefügt: mehr]</ins> Radwege.</p><p class="deleted">[gestrichen: Alter Satz.]</p><p class="inserted">[eingefügt: Neuer Satz.]</p>'
    );
  });
});

describe('isCandidacy', () => {
  it('erkennt eine Bewerbung an ihrem Foto-Abschnitt', () => {
    expect(
      isCandidacy({
        sections: [
          { type: 'Image', title: 'Foto', html: '<img src="x.jpg">' },
          { type: 'TextSimple', title: 'Selbstvorstellung', html: '<p>Hallo</p>' },
        ],
      })
    ).toBe(true);
    expect(
      isCandidacy({ sections: [{ type: 'TextSimple', title: 'Antragstext', html: '<p>…</p>' }] })
    ).toBe(false);
  });
});

describe('parteitagLabelOf', () => {
  it('hängt das Jahr nur an, wenn es nicht schon im Kurztitel steht', () => {
    expect(parteitagLabelOf({ title_short: 'LDK Essen', date_published: '2026-08-20' })).toBe(
      'LDK Essen (2026)'
    );
    expect(
      parteitagLabelOf({ title_short: 'LDK NRW April 2021', date_published: '2020-12-01' })
    ).toBe('LDK NRW April 2021');
    expect(parteitagLabelOf({ title_short: 'LPR', date_published: null })).toBe('LPR');
  });
});

describe('initiatorNames / plainText', () => {
  it('nimmt bei Organisationen den Namen der Organisation und entfernt Markup aus dem Status', () => {
    expect(
      initiatorNames([
        { type: 'organization', name: null, organization: 'Landesvorstand NRW' },
        { type: 'person', name: 'Erika Beispiel', organization: 'KV Köln' },
        { type: 'organization', name: null, organization: 'Landesvorstand NRW' },
      ])
    ).toEqual(['Landesvorstand NRW', 'Erika Beispiel']);
    expect(plainText('<span class="screened">Geprüft</span>')).toBe('Geprüft');
  });
});
