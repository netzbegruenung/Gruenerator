import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { AI_CONTENT_CREDENTIALS, embedAiContentCredentials } from './aiContentCredentials.js';

async function solid(format: 'png' | 'jpeg' | 'webp'): Promise<Buffer> {
  const base = sharp({ create: { width: 32, height: 32, channels: 3, background: '#005437' } });
  return base.toFormat(format).toBuffer();
}

describe('embedAiContentCredentials', () => {
  // Der Punkt der ganzen Übung: die Kennzeichnung muss auch dann in der Datei
  // stehen, wenn das sichtbare Wasserzeichen abgewählt wurde (Art. 50 Abs. 2
  // KI-VO). Der Test prüft deshalb den rohen, unbeschrifteten Puffer.
  it.each(['png', 'jpeg', 'webp'] as const)(
    'schreibt DigitalSourceType in %s und behält das Format',
    async (format) => {
      const out = await embedAiContentCredentials(await solid(format));
      const meta = await sharp(out).metadata();

      expect(meta.format).toBe(format === 'jpeg' ? 'jpeg' : format);
      expect(meta.xmp?.toString('utf8')).toContain(AI_CONTENT_CREDENTIALS.digitalSourceType);
    }
  );

  it('gibt den Puffer unverändert zurück, wenn er kein Bild ist', async () => {
    const junk = Buffer.from('kein bild');
    expect(await embedAiContentCredentials(junk)).toBe(junk);
  });
});
