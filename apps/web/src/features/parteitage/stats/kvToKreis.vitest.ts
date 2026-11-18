import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { kvToAgs } from './kvToKreis';

// KV-Namen des Essen-Exports (nur Namen) plus Mülheim.
const KVS = [
  'Aachen',
  'Bielefeld',
  'Bochum',
  'Bochum&Wattenscheid',
  'Bonn',
  'Borken',
  'Coesfeld',
  'Dortmund',
  'Duisburg',
  'Düren',
  'Düsseldorf',
  'Ennepe-Ruhr',
  'Essen',
  'Euskirchen',
  'Gelsenkirchen',
  'Gütersloh',
  'Hamm',
  'Heinsberg',
  'Herford',
  'Herne',
  'Hochsauerland',
  'Kleve',
  'Krefeld',
  'Köln',
  'Leverkusen',
  'Lippe',
  'Mettmann',
  'Minden-Lübbecke',
  'Märkischer Kreis',
  'Mönchengladbach',
  'Münster',
  'Oberberg',
  'Oberhausen',
  'Olpe',
  'Paderborn',
  'Recklinghausen',
  'Remscheid',
  'Rhein-Erft-Kreis',
  'Rhein-Kreis-Neuss',
  'Rhein-Sieg',
  'Rheinisch-Bergischer Kreis',
  'Soest',
  'Solingen',
  'Steinfurt',
  'Unna',
  'Viersen',
  'Warendorf',
  'Wesel',
  'Wuppertal',
  'Mülheim an der Ruhr',
];

describe('kvToAgs', () => {
  it('every KV of the Essen fixture maps to an AGS', () => {
    for (const kv of KVS) expect(kvToAgs(kv), kv).toMatch(/^05\d{3}$/);
  });
  it('maps special cases', () => {
    expect(kvToAgs('Bochum&Wattenscheid')).toBe('05911');
    expect(kvToAgs('Rhein-Sieg')).toBe('05382');
    expect(kvToAgs('Aachen')).toBe('05334');
  });
  it('returns null for non-district bodies', () => {
    expect(kvToAgs('Grüne Jugend NRW')).toBeNull();
    expect(kvToAgs('GRÜNE JUGEND NRW')).toBeNull();
  });
  it('every mapped AGS exists in the geo file', () => {
    const geo = JSON.parse(
      readFileSync(resolve(__dirname, '../../../../public/geo/nrw-kreise.geo.json'), 'utf8')
    ) as { features: { properties: { AGS: string } }[] };
    const ags = new Set(geo.features.map((f) => f.properties.AGS));
    for (const kv of KVS) expect(ags.has(kvToAgs(kv) ?? ''), kv).toBe(true);
  });
});
