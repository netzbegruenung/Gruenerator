import { describe, expect, it } from 'vitest';

import { LANDESVERBAENDE } from '../agents/landesverbaende';

import {
  LANDESVERBAND_COVERS,
  landesverbandCardPaths,
  landesverbandCoverForNotebook,
} from './landesverbandCovers';

describe('landesverbandCoverForNotebook', () => {
  it('gives every Landesverband notebook its Landesverband photo', () => {
    for (const lv of LANDESVERBAENDE) {
      expect(landesverbandCoverForNotebook(lv.notebookId)).toBe(LANDESVERBAND_COVERS[lv.id]);
    }
  });

  it('gives any other notebook none', () => {
    expect(landesverbandCoverForNotebook('kommunalwiki-notebook')).toBeNull();
  });

  it('builds origin-relative card paths', () => {
    expect(landesverbandCardPaths(LANDESVERBAND_COVERS.berlin)).toEqual({
      w320: '/images/marketplace/landesverbaende/berlin-v1-card-320.webp',
      w480: '/images/marketplace/landesverbaende/berlin-v1-card-480.webp',
    });
  });
});
