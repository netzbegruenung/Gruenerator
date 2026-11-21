import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import AssSubtitleService from '../assSubtitleService.js';

// The burn-in height lives in `\pos`, which overrides the style's marginV. A
// caller that computes marginV from heightPreference but does not pass the
// preference to generateAssContent silently renders at the default (67 %),
// which is how every auto export ignored 'tief' (#5930).
const assService = new AssSubtitleService();
const metadata = { width: 1080, height: 1920, duration: 4 };
const segments = [{ text: 'Wir kämpfen für mehr', startTime: 0, endTime: 2 }];

function posY(heightPreference: string): number {
  const { content } = assService.generateAssContent(
    segments,
    metadata,
    { fontSize: 40 },
    'manual',
    'shadow',
    'de-DE',
    heightPreference
  );
  const match = content.match(/\\pos\(\d+(?:\.\d+)?,(\d+(?:\.\d+)?)\)/);
  if (!match) throw new Error('no \\pos in ASS output');
  return Number(match[1]) / metadata.height;
}

describe('burn-in height', () => {
  it("places 'tief' at 80 % and 'standard' at 67 % of the frame", () => {
    expect(posY('tief')).toBeCloseTo(0.8, 2);
    expect(posY('standard')).toBeCloseTo(0.67, 2);
  });

  it('every subtitler export passes the height preference on', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
    for (const file of [
      'autoProcessingService.ts',
      'exportService.ts',
      'segmentExportService.ts',
      'backgroundExportService.ts',
      'processingJobService.ts',
      'downloadUtils.ts',
    ]) {
      const source = readFileSync(join(dir, file), 'utf8');
      const start = source.indexOf('generateAssContent(');
      const call = source.slice(start, source.indexOf(');', start));
      expect(call, file).toMatch(/[hH]eightPreference/);
    }
  });
});
