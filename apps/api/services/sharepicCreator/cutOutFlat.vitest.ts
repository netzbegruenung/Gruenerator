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
  const at = (x: number, y: number) => data[(y * info.width + x) * 4 + 3]!;
  // The motive's box: where it stands in the stored square.
  const box = { left: info.width, top: info.height, right: 0, bottom: 0 };
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (at(x, y) > 0) {
        box.left = Math.min(box.left, x);
        box.top = Math.min(box.top, y);
        box.right = Math.max(box.right, x + 1);
        box.bottom = Math.max(box.bottom, y + 1);
      }
  const cx = Math.round((box.left + box.right) / 2);
  const cy = Math.round((box.top + box.bottom) / 2);
  return { at, info, box, cx, cy };
}

describe('cutOutFlat', () => {
  it('clears the white around the motive and the gap a ring encloses', async () => {
    const { at, info, box, cx, cy } = await alpha(
      await cutOutFlat(
        await png(
          '<circle cx="100" cy="100" r="60" fill="none" stroke="#005538" stroke-width="20"/>'
        )
      )
    );
    expect(at(1, 1)).toBe(0);
    // The ring itself stays.
    expect(at(box.left + Math.round((box.right - box.left) * 0.07), cy)).toBe(255);
    // Its inside is background showing through.
    expect(at(cx, cy)).toBe(0);
    // Squared, the ring standing on the bottom edge.
    expect(info.width).toBe(info.height);
    expect(box.bottom).toBe(info.height);
  });

  // The hole threshold is a share of the image: 60 px here, ~1,600 px on a 1024 px paint.
  it('keeps a small white highlight inside the motive', async () => {
    const { at, cx, cy } = await alpha(
      await cutOutFlat(
        await png(
          '<circle cx="100" cy="100" r="60" fill="#005538"/><rect x="97" y="97" width="6" height="6" fill="#ffffff"/>'
        )
      )
    );
    expect(at(cx, cy)).toBe(255);
  });

  it('keeps a shaded white surface of the motive whole', async () => {
    // A switch plate: a dark frame around a light grey-to-white gradient.
    const { at, box, cx, cy } = await alpha(
      await cutOutFlat(
        await png(
          '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ececec"/></linearGradient></defs>' +
            '<rect x="40" y="40" width="120" height="120" fill="#005538"/><rect x="55" y="55" width="90" height="90" fill="url(#g)"/>'
        )
      )
    );
    expect(at(cx, box.top + Math.round((box.bottom - box.top) * 0.2))).toBe(255);
    expect(at(cx, cy)).toBe(255);
  });

  it('gives a compact motive more air than a wide one, so both look as heavy', async () => {
    const share = async (shape: string) => {
      const { info, box } = await alpha(await cutOutFlat(await png(shape)));
      return ((box.right - box.left) * (box.bottom - box.top)) / (info.width * info.height);
    };
    const block = await share('<rect x="40" y="40" width="120" height="120" fill="#005538"/>');
    const bar = await share('<rect x="10" y="90" width="180" height="30" fill="#005538"/>');
    expect(block).toBeLessThan(0.35);
    expect(bar).toBeLessThan(block);
    // The bar is too wide to shrink: it still spans the square.
    expect(bar).toBeGreaterThan(0.12);
  });
});
