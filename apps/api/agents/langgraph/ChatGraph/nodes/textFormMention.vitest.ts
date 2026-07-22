/**
 * Unit tests for deriveTextFormMention — the mapping from an active skill mention
 * to the lookup key for a user's learned text form ("Texte anlernen").
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { describe, it, expect } from 'vitest';

import { deriveTextFormMention } from './textFormMention.js';

describe('deriveTextFormMention', () => {
  it('returns null when no mention is active', () => {
    expect(deriveTextFormMention(null, undefined)).toBeNull();
  });

  it('folds all Instagram skill variants onto the instagram preset', () => {
    expect(deriveTextFormMention('instagram', undefined)).toBe('instagram');
    expect(deriveTextFormMention('insta-berlin', undefined)).toBe('instagram');
  });

  it('folds Facebook variants onto the facebook preset', () => {
    expect(deriveTextFormMention('facebook', undefined)).toBe('facebook');
    expect(deriveTextFormMention('facebook-hamburg', undefined)).toBe('facebook');
  });

  it('folds all Presse skill variants (incl. LV) onto the presse preset', () => {
    expect(deriveTextFormMention('presse', undefined)).toBe('presse');
    expect(deriveTextFormMention('presse-bayern', undefined)).toBe('presse');
  });

  it('maps a dokumente-category skill onto the antrag preset', () => {
    expect(deriveTextFormMention('irgendein-antrag-skill', { skillCategory: 'dokumente' })).toBe(
      'antrag'
    );
  });

  it('returns the raw mention for a custom text form (no matching preset/category)', () => {
    expect(deriveTextFormMention('omveinladungen', undefined)).toBe('omveinladungen');
    expect(deriveTextFormMention('twitter', { skillCategory: 'social' })).toBe('twitter');
  });
});
