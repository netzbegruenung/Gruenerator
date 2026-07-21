import { describe, expect, it } from 'vitest';

import { condenseBahnTimetable, extractNewsResults } from './systemMcpCatalog.js';

// Trimmed real-shape sample from the DB IRIS API (get_planned_timetable).
const IRIS_SAMPLE = JSON.stringify({
  '@station': 'Köln Hbf',
  s: [
    {
      '@id': '-331607-2607170516-8',
      tl: { '@c': 'ICE', '@n': '204' },
      ar: { '@pt': '2607170905', '@pp': '5', '@ppth': 'Basel SBB|Frankfurt(M) Flughafen Fernbf' },
      dp: {
        '@pt': '2607170911',
        '@pp': '5',
        '@ppth': 'Düsseldorf Hbf|Duisburg Hbf|Hamburg-Altona',
      },
    },
    {
      '@id': '784306-2607170805-14',
      tl: { '@c': 'RB', '@n': '10416' },
      ar: { '@pt': '2607170912', '@pp': '1 A-C', '@l': 'RB24', '@ppth': 'Kall|Köln West' },
      dp: { '@pt': '2607170915', '@pp': '1 A-C', '@l': 'RB24', '@ppth': 'Köln Messe/Deutz' },
    },
    {
      '@id': '455827-2607170643-7',
      tl: { '@c': 'IC', '@n': '2441' },
      ar: { '@pt': '2607170906', '@pp': '4 A-C', '@ppth': 'Frankfurt(Main)Hbf|Bonn Hbf' },
      dp: {
        '@pt': '2607170911',
        '@pp': '4 A-C',
        '@ppth': 'Solingen Hbf|Wuppertal Hbf|Dresden Hbf',
      },
    },
  ],
});

describe('condenseBahnTimetable', () => {
  it('condenses IRIS JSON to a sorted departure board', () => {
    const payload = condenseBahnTimetable(IRIS_SAMPLE);
    expect(payload).not.toBeNull();
    expect(payload?.kind).toBe('timetable');
    expect(payload?.station).toBe('Köln Hbf');
    expect(payload?.date).toBe('2026-07-17');
    expect(payload?.entries).toHaveLength(3);
    // Sorted by departure time; equal times keep a stable order.
    expect(payload?.entries.map((e) => e.departureTime)).toEqual(['09:11', '09:11', '09:15']);
    const ice = payload?.entries.find((e) => e.number === '204');
    expect(ice?.category).toBe('ICE');
    expect(ice?.departurePlatform).toBe('5');
    expect(ice?.destination).toBe('Hamburg-Altona');
    expect(ice?.via).toEqual(['Düsseldorf Hbf', 'Duisburg Hbf', 'Hamburg-Altona']);
    const rb = payload?.entries.find((e) => e.line === 'RB24');
    expect(rb?.destination).toBe('Köln Messe/Deutz');
  });

  it('derives the header from the EARLIEST departure, not raw server order', () => {
    const sample = JSON.stringify({
      '@station': 'Köln Hbf',
      s: [
        // Arrival-only terminating train from the previous day listed FIRST.
        { '@id': 'a', tl: { '@c': 'IC', '@n': '99' }, ar: { '@pt': '2607162358', '@pp': '9' } },
        {
          '@id': 'b',
          tl: { '@c': 'RE', '@n': '7' },
          dp: { '@pt': '2607170007', '@pp': '3', '@ppth': 'Bonn Hbf' },
        },
      ],
    });
    const payload = condenseBahnTimetable(sample);
    expect(payload?.date).toBe('2026-07-16');
    expect(payload?.hour).toBe('23');
    // Earliest pt across ALL stops (dp preferred per stop) wins — deterministic
    // regardless of the server's list order.
    const reversed = condenseBahnTimetable(
      JSON.stringify({ '@station': 'Köln Hbf', s: JSON.parse(sample).s.reverse() })
    );
    expect(reversed?.date).toBe('2026-07-16');
    expect(reversed?.hour).toBe('23');
  });

  it('returns null for non-JSON / unexpected shapes (raw passthrough)', () => {
    expect(condenseBahnTimetable('Error executing tool …')).toBeNull();
    expect(condenseBahnTimetable('{"foo": 1}')).toBeNull();
    expect(condenseBahnTimetable('{"@station":"X","s":[]}')).toBeNull();
    // Truncated JSON (client cap mid-payload) must not throw.
    expect(condenseBahnTimetable(IRIS_SAMPLE.slice(0, 120))).toBeNull();
  });
});

const NEWS_SAMPLE = `# Search Results for 'Klimaschutz'

Found 97 results total. Showing 2 on page 0.

## Werden Hessens Klimaziele abgeschwächt?
*2026-07-15T20:24:44.458+02:00*
Type: video
https://www.tagesschau.de/inland/regional/hessen/klimaziele-100.html

---

## Sommerpressekonferenz des Bundeskanzlers
*2026-07-16T10:38:08.392+02:00*
Type: video

📺 **Video-Streams:**
  - 📼 On-Demand (h264s): https://tagesschau-progressive.ard-mcdn.de/video/x.mp4

---
`;

describe('extractNewsResults', () => {
  it('extracts titled sections with tagesschau URLs as SearchResults', () => {
    const results = extractNewsResults(NEWS_SAMPLE);
    expect(results).toHaveLength(2);
    expect(results[0]?.source).toBe('tagesschau');
    expect(results[0]?.title).toBe('Werden Hessens Klimaziele abgeschwächt?');
    expect(results[0]?.url).toBe(
      'https://www.tagesschau.de/inland/regional/hessen/klimaziele-100.html'
    );
    expect(results[0]?.content).toContain('2026-07-15');
    // Second item has no tagesschau web link — still a result, just without url.
    expect(results[1]?.title).toBe('Sommerpressekonferenz des Bundeskanzlers');
    expect(results[1]?.url).toBeUndefined();
  });

  it('returns [] for unstructured text', () => {
    expect(extractNewsResults('Keine Ergebnisse gefunden.')).toEqual([]);
  });
});
