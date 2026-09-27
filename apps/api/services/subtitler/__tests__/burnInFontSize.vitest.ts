import { describe, expect, it } from 'vitest';

import AssSubtitleService from '../assSubtitleService.js';
import { calculateFontSizing } from '../subtitleSizingService.js';

// Both burn-in paths (auto job and manual export) must feed the same
// `calculateFontSizing` result, halved, into the ASS generator. These values
// are the 1080x1920 worked example: base 58, content scale 0.95–1.32,
// then ×2.25 (1080 bracket) ×1.2 ('manual') inside the ASS service.
const assService = new AssSubtitleService();
const metadata = { width: 1080, height: 1920, duration: 10 };

function assFontSize(texts: string[]): number {
  const segments = texts.map((text, i) => ({ text, startTime: i, endTime: i + 1 }));
  const { finalFontSize } = calculateFontSizing(metadata, segments);
  const { content } = assService.generateAssContent(
    segments,
    metadata,
    {
      fontSize: Math.floor(finalFontSize / 2),
      marginL: 10,
      marginR: 10,
      marginV: 384,
      alignment: 2,
    },
    'manual',
    'shadow',
    'de-DE'
  );
  const match = content.match(/^Style: Default,[^,]*,(\d+),/m);
  if (!match) throw new Error('no Default style line in ASS output');
  return Number(match[1]);
}

describe('burn-in font size (shared by auto job and manual export)', () => {
  it('scales short reel lines up to Fontsize 102', () => {
    expect(assFontSize(['Wir machen das', 'Jetzt oder nie', 'Grün wirkt'])).toBe(102);
  });

  it('keeps 30-char / 5-word lines at Fontsize 86', () => {
    expect(assFontSize(['Wir wollen eine gute Zukunft!!', 'Wir wollen eine gute Zukunft!!'])).toBe(
      86
    );
  });
});
