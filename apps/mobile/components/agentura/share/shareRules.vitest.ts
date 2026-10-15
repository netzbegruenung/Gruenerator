import { ApiError } from '@gruenerator/shared/api';
import { describe, expect, it } from 'vitest';

import { planListingToggle, shareErrorText } from './shareRules';

describe('planListingToggle', () => {
  it('hebt aus einer niedrigeren Stufe zuerst auf „Mit Anmeldung"', () => {
    expect(planListingToggle(true, 'private', null)).toEqual({
      promote: true,
      listing: { is_public: true, public_ownership: 'owner' },
    });
  });

  it('behält eine gewählte Eigentumsangabe', () => {
    expect(planListingToggle(true, 'authenticated', 'public_data')).toEqual({
      promote: false,
      listing: { is_public: true, public_ownership: 'public_data' },
    });
  });

  it('nimmt beim Ausschalten die Eigentumsangabe mit', () => {
    expect(planListingToggle(false, 'authenticated', 'owner')).toEqual({
      promote: false,
      listing: { is_public: false, public_ownership: null },
    });
  });
});

describe('shareErrorText', () => {
  it('zeigt den Satz des Servers bei 409', () => {
    expect(shareErrorText(new ApiError(409, 'Nur eigene Rezepte.'))).toBe('Nur eigene Rezepte.');
  });

  it('verbirgt technische Meldungen', () => {
    expect(shareErrorText(new ApiError(500, 'Failed (HTTP 500)'))).toBe(
      'Die Freigabe konnte nicht geändert werden.'
    );
  });
});
