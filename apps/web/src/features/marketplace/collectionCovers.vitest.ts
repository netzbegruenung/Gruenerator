import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  LANDESVERBAND_COVERS,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_COLLECTIONS,
} from '@gruenerator/shared/marketplace';
import { describe, expect, it } from 'vitest';

const IMAGES = resolve(__dirname, '../../../public/images/marketplace');
const PUBLIC = resolve(IMAGES, 'collections');

// A typo in a cover's stem shows only as a broken image in production; nginx
// serves `/images/**` immutable, so the files must exist under the exact name.
describe('collection covers', () => {
  it('ship the card and banner sizes of every cover the registry names', () => {
    for (const { id, cover } of MARKETPLACE_COLLECTIONS) {
      if (!cover) continue;
      const files = [640, 1200].map((w) => `${cover.file}-${w}.webp`);
      const banners = [640, 1200, 1920, 2400].map((w) => `${cover.file}-banner-${w}.webp`);
      for (const file of [...files, ...banners]) {
        expect(existsSync(resolve(PUBLIC, file)), `${id}: ${file}`).toBe(true);
      }
    }
  });

  it('ship the banner and the card cut of every Landesverband photo', () => {
    for (const [lvId, cover] of Object.entries(LANDESVERBAND_COVERS)) {
      for (const suffix of ['640', '1200', '1920', '2400', 'card-320', 'card-480']) {
        const file = `${cover.file}-${suffix}.webp`;
        expect(existsSync(resolve(IMAGES, 'landesverbaende', file)), `${lvId}: ${file}`).toBe(true);
      }
    }
  });

  it('ship both sizes of every category tile', () => {
    for (const { id, cover } of MARKETPLACE_CATEGORIES) {
      for (const width of [640, 1200]) {
        const file = `${cover.file}-${width}.webp`;
        expect(existsSync(resolve(IMAGES, 'kategorien', file)), `${id}: ${file}`).toBe(true);
      }
    }
  });
});
