/**
 * Guards `scrubThirdPartyContacts` against the two things a Wolke Wahlprüfsteine
 * share actually contains: third-party e-mail addresses (posteo/web.de/riseup
 * next to the party's own function addresses) and labeled phone numbers. See
 * `LandesverbandScraper.ts`'s Wolke branch for where this runs.
 */
import { describe, expect, it } from 'vitest';

import { scrubThirdPartyContacts } from './contactScrub.js';

describe('scrubThirdPartyContacts', () => {
  it('keeps party e-mail addresses', () => {
    const partyAddresses = [
      'landesgeschaeftsstelle@gruene-berlin.de',
      'wahlpruefsteine@gruene-berlin.de',
      'kontakt@grueneberlin.de',
      'info@gruene.de',
      'presse@gruene-fraktion-berlin.de',
      'jugend@gruene-jugend.de',
    ];
    for (const address of partyAddresses) {
      const { text, redactions } = scrubThirdPartyContacts(`Kontakt: ${address}`);
      expect(text).toBe(`Kontakt: ${address}`);
      expect(redactions).toBe(0);
    }
  });

  it('redacts third-party e-mail addresses', () => {
    const { text, redactions } = scrubThirdPartyContacts(
      'Bitte antworten Sie an x@posteo.de, y@web.de oder z@riseup.net.'
    );
    expect(text).toBe(
      'Bitte antworten Sie an [E-Mail entfernt], [E-Mail entfernt] oder [E-Mail entfernt].'
    );
    expect(redactions).toBe(3);
  });

  it('redacts look-alike domains that are not the party', () => {
    for (const address of [
      'info@gruenderzentrum-berlin.de',
      'kontakt@existenzgruendung.de',
      'buero@gruene-liga.de',
      'post@grueneliga-berlin.de',
    ]) {
      expect(scrubThirdPartyContacts(`Kontakt: ${address}`)).toEqual({
        text: 'Kontakt: [E-Mail entfernt]',
        redactions: 1,
      });
    }
  });

  it('keeps a party address while redacting a third-party one in the same text', () => {
    const { text, redactions } = scrubThirdPartyContacts(
      'Ansprechpartnerin: wahlpruefsteine@gruene-berlin.de, privat: x@posteo.de'
    );
    expect(text).toBe(
      'Ansprechpartnerin: wahlpruefsteine@gruene-berlin.de, privat: [E-Mail entfernt]'
    );
    expect(redactions).toBe(1);
  });

  it.each([
    ['Tel.: 030 / 123 456-78', 'Tel.: [Telefon entfernt]'],
    ['Mobil 0171 1234567', 'Mobil [Telefon entfernt]'],
    ['Telefon: +49 30 1234567', 'Telefon: [Telefon entfernt]'],
  ])('redacts a labeled phone number: %s', (input, expected) => {
    const { text, redactions } = scrubThirdPartyContacts(input);
    expect(text).toBe(expected);
    expect(redactions).toBe(1);
  });

  it.each(['Handy 0176 55 44 33', 'Fon: 030-12345', 'Fax 030/12345'])(
    'redacts other labels: %s',
    (input) => {
      const { redactions } = scrubThirdPartyContacts(input);
      expect(redactions).toBe(1);
    }
  );

  it('leaves unlabeled digit runs untouched', () => {
    const cases = ['20210827', '0000 0000', '12.08.2026', 'Az. 030 123'];
    for (const input of cases) {
      const { text, redactions } = scrubThirdPartyContacts(input);
      expect(text).toBe(input);
      expect(redactions).toBe(0);
    }
  });

  it('removes a party phone number too when labeled (the party contact is the e-mail)', () => {
    const { text, redactions } = scrubThirdPartyContacts(
      'Tel.: 030 123456, wahlpruefsteine@gruene-berlin.de'
    );
    expect(text).toBe('Tel.: [Telefon entfernt], wahlpruefsteine@gruene-berlin.de');
    expect(redactions).toBe(1);
  });

  it('is idempotent', () => {
    const input =
      'Tel.: 030 / 123 456-78, privat x@posteo.de, Az. 030 123, 12.08.2026, ' +
      'wahlpruefsteine@gruene-berlin.de';
    const first = scrubThirdPartyContacts(input);
    const second = scrubThirdPartyContacts(first.text);
    expect(second.text).toBe(first.text);
    expect(second.redactions).toBe(0);
  });
});
