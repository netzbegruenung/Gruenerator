/**
 * Die Umlaut-Domains der Allowlist standen als handgeschriebene A-Label im
 * Code und waren allesamt falsch — `xn--grenerator-z2a.de` ist nicht einmal
 * gültig, `xn--grenerator-test-4pb.de` dekodiert zu `grenïerator-test.de`. Der
 * Browser schickt `Origin` immer als A-Label, also blockierte CORS die echten
 * Umlaut-Domains, während die Liste danach aussah, als deckte sie sie ab.
 *
 * Der Test prüft nicht die konkreten Zeichenketten (das wäre dieselbe Handarbeit
 * noch einmal), sondern die Eigenschaft: jedes `xn--`-Label der Liste muss sich
 * zurück in eine Domain dekodieren lassen, die ebenfalls in der Liste steht.
 */
import { domainToASCII, domainToUnicode } from 'node:url';

import { describe, expect, it } from 'vitest';

import { validateCorsOrigin } from './cors.js';
import { ALLOWED_DOMAINS } from './domains.js';

import { getCorsOrigins } from '../utils/domainUtils.js';

const asciiEntries = ALLOWED_DOMAINS.filter((d) => d.includes('xn--'));

describe('IDN-Einträge der Domain-Allowlist', () => {
  it('führt überhaupt A-Label (sonst prüft der Rest nichts)', () => {
    expect(asciiEntries.length).toBeGreaterThan(0);
  });

  it.each(asciiEntries)('%s ist ein gültiges A-Label', (entry) => {
    expect(domainToUnicode(entry)).not.toBe('');
    // Rundreise: dekodieren und wieder kodieren muss denselben Eintrag ergeben.
    expect(domainToASCII(domainToUnicode(entry))).toBe(entry);
  });

  it.each(asciiEntries)('%s hat seine Umlaut-Schreibweise in der Liste', (entry) => {
    expect(ALLOWED_DOMAINS).toContain(domainToUnicode(entry));
  });

  it('lässt grünerator.de in der Form durch, die der Browser sendet', () => {
    const origins = getCorsOrigins();
    const origin = `https://${domainToASCII('www.grünerator.de')}`;

    expect(validateCorsOrigin(origin, {}, origins)).toMatchObject({ allowed: true });
  });

  it('blockt eine fremde Domain weiterhin', () => {
    const result = validateCorsOrigin('https://example.invalid', {}, getCorsOrigins());

    expect(result).toMatchObject({ allowed: false, reason: 'origin-not-allowed' });
  });
});
