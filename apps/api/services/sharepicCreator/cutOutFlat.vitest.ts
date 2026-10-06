import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { cutOutFlat } from './illustrations.js';

/** Rendered on white, the way FLUX paints a spot illustration. */
const png = (shapes: string) =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ffffff"/>${shapes}</svg>`
    )
  )
    .png()
    .toBuffer();

async function alpha(out: Buffer) {
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  return { at: (x: number, y: number) => data[(y * info.width + x) * 4 + 3], info };
}

describe('cutOutFlat', () => {
  it('clears the white around the motive and the gap a ring encloses', async () => {
    const { at, info } = await alpha(
      await cutOutFlat(
        await png(
          '<circle cx="100" cy="100" r="60" fill="none" stroke="#005538" stroke-width="20"/>'
        )
      )
    );
    const c = Math.round(info.width / 2);
    expect(at(1, 1)).toBe(0);
    // The ring itself stays.
    expect(at(Math.round(info.width * 0.1), c)).toBe(255);
    // Its inside is background showing through.
    expect(at(c, c)).toBe(0);
    // Trimmed to the ring and squared.
    expect(info.width).toBe(info.height);
  });

  // The hole threshold is a share of the image: 60 px here, ~1,600 px on a 1024 px paint.
  it('keeps a small white highlight inside the motive', async () => {
    const { at, info } = await alpha(
      await cutOutFlat(
        await png(
          '<circle cx="100" cy="100" r="60" fill="#005538"/><rect x="97" y="97" width="6" height="6" fill="#ffffff"/>'
        )
      )
    );
    const c = Math.round(info.width / 2);
    expect(at(c, c)).toBe(255);
  });

  it('keeps a shaded white surface of the motive whole', async () => {
    // A switch plate: a dark frame around a light grey-to-white gradient.
    const { at, info } = await alpha(
      await cutOutFlat(
        await png(
          '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ececec"/></linearGradient></defs>' +
            '<rect x="40" y="40" width="120" height="120" fill="#005538"/><rect x="55" y="55" width="90" height="90" fill="url(#g)"/>'
        )
      )
    );
    const c = Math.round(info.width / 2);
    expect(at(c, Math.round(info.width * 0.3))).toBe(255);
    expect(at(c, c)).toBe(255);
  });
});
