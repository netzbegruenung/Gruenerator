import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/index.js';

import {
  UNLIST,
  agentSharePath,
  planListing,
  recipeSharePath,
  shareErrorText,
} from './shareRules.js';

describe('planListing', () => {
  it('hebt aus einer niedrigeren Stufe zuerst auf „Mit Anmeldung"', () => {
    expect(planListing('private', 'owner')).toEqual({
      promote: true,
      listing: { is_public: true, public_ownership: 'owner' },
    });
    expect(planListing('groups', 'public_data').promote).toBe(true);
  });

  it('listet mit genau der gewählten Eigentumsangabe', () => {
    expect(planListing('authenticated', 'public_data')).toEqual({
      promote: false,
      listing: { is_public: true, public_ownership: 'public_data' },
    });
  });

  it('nimmt beim Ausschalten die Eigentumsangabe mit', () => {
    expect(UNLIST).toEqual({ is_public: false, public_ownership: null });
  });
});

describe('shareErrorText', () => {
  it.each([400, 403, 409])('zeigt den Satz des Servers bei %i', (status) => {
    expect(shareErrorText(new ApiError(status, 'Mit diesem Projekt darfst du nicht teilen.'))).toBe(
      'Mit diesem Projekt darfst du nicht teilen.'
    );
  });

  it('verbirgt technische Meldungen', () => {
    expect(shareErrorText(new ApiError(500, 'Internal server error'))).toBe(
      'Die Freigabe konnte nicht geändert werden.'
    );
    expect(shareErrorText(new Error('Network Error'))).toBe(
      'Die Freigabe konnte nicht geändert werden.'
    );
  });
});

describe('Teilen-Links', () => {
  it('führt einen Nutzer-Agent über seine uuid, nicht den nur pro Person eindeutigen identifier', () => {
    expect(
      agentSharePath({ id: '6f1c2d3e-0000-4000-8000-000000000001', identifier: 'klima' })
    ).toBe('/agentura/agent/6f1c2d3e-0000-4000-8000-000000000001');
  });

  it('kodiert die Rezept-Mention', () => {
    expect(recipeSharePath('mein rezept')).toBe('/agentura/rezept/mein%20rezept');
  });
});
