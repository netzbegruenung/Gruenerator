/**
 * The two pure decisions of `userTextFormsContractRouter`: which mentions a
 * draft must avoid, and how a sharing verdict becomes an HTTP answer.
 */

import { textFormTypeSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { collectTakenMentions, sharingFailure } from './textFormRouterHelpers.js';

describe('collectTakenMentions', () => {
  it('reserves every preset text type', () => {
    const taken = collectTakenMentions([]);
    for (const type of textFormTypeSchema.options) expect(taken.has(type)).toBe(true);
  });

  it('reserves system skill mentions', () => {
    // `presse` is a system skill as well as a preset; the set holds it once.
    expect(collectTakenMentions([]).has('presse')).toBe(true);
  });

  it('adds the caller own recipes', () => {
    const taken = collectTakenMentions([{ mention: 'omveinladungen', sharedFromGroup: null }]);
    expect(taken.has('omveinladungen')).toBe(true);
  });

  it('leaves a group-shared recipe mention free', () => {
    // It lives under its owner's account — reserving it here would block a
    // name the caller can legitimately use for their own recipe.
    const taken = collectTakenMentions([{ mention: 'fremdrezept', sharedFromGroup: 'OV Nord' }]);
    expect(taken.has('fremdrezept')).toBe(false);
  });
});

describe('sharingFailure', () => {
  it('passes a successful write through', () => {
    expect(sharingFailure({ ok: true, updated: true })).toBeNull();
  });

  it('turns a missing recipe into 404', () => {
    expect(sharingFailure({ ok: true, updated: false })?.status).toBe(404);
  });

  it('turns a system-recipe override into 409', () => {
    expect(sharingFailure({ ok: false, reason: 'not_custom' })?.status).toBe(409);
  });

  it('turns a missing attestation into 400', () => {
    expect(sharingFailure({ ok: false, reason: 'ownership_required' })?.status).toBe(400);
  });
});
