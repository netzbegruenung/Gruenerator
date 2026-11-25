import { monitorLandSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { BRIEFING_LAENDER, parseBriefingLand } from './briefingLaender.js';
import { landtagNewsItems } from './news.js';

describe('BRIEFING_LAENDER', () => {
  it('lists every Land of the contract, once', () => {
    expect(BRIEFING_LAENDER.map((l) => l.id).sort()).toEqual([...monitorLandSchema.options].sort());
  });

  it('parses ?land= regardless of the viewer locale', () => {
    expect(parseBriefingLand('hessen')?.name).toBe('Hessen');
    expect(parseBriefingLand('steiermark')?.locale).toBe('at');
    expect(parseBriefingLand('bayern')).toBeNull();
    expect(parseBriefingLand(null)).toBeNull();
  });
});

describe('landtagNewsItems', () => {
  it('puts document type and factions where a news card shows the source', () => {
    const now = Date.parse('2026-11-25T12:00:00Z');
    const [withParty, without] = landtagNewsItems(
      [
        {
          title: 'Pflegereform und Sozialraumbudget',
          url: 'https://landtag.nrw.de/a.pdf',
          docType: 'Antrag auf Aktuelle Stunde',
          parties: ['SPD'],
          documentNumber: '18/22231',
          publishedAt: '2026-11-23T12:00:00Z',
        },
        {
          title: 'Gesetz zur Modernisierung des öffentlichen Dienstes',
          url: 'https://landtag.nrw.de/b.pdf',
          docType: 'Beschlussempfehlung und Bericht',
          parties: [],
          documentNumber: null,
          publishedAt: null,
        },
      ],
      now
    );
    expect(withParty).toMatchObject({
      source: 'Antrag auf Aktuelle Stunde · SPD',
      time: 'vor 2 Tagen',
    });
    expect(without).toMatchObject({ source: 'Beschlussempfehlung und Bericht', time: '' });
  });
});
