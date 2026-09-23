import { describe, expect, it } from 'vitest';

import { isPraezisionEligible, resolveNotebookAnswerMode } from './notebookAnswerModeResolver.js';

const USER_NB = '0b1c29c9-9823-4794-b1be-70a36f801791';

describe('resolveNotebookAnswerMode', () => {
  it('runs chat when the request names no mode', async () => {
    expect(
      await resolveNotebookAnswerMode({
        requested: null,
        collectionIds: [USER_NB],
        userLocale: null,
      })
    ).toEqual({
      decision: { requested: null, resolved: 'chat', reason: 'default' },
      warning: null,
    });
  });

  it('runs chat when chat was asked for', async () => {
    const out = await resolveNotebookAnswerMode({
      requested: 'chat',
      collectionIds: [USER_NB],
      userLocale: 'de-DE',
    });
    expect(out.decision).toEqual({ requested: 'chat', resolved: 'chat', reason: 'explicit' });
  });

  it('treats auto as chat until the guard exists', async () => {
    const out = await resolveNotebookAnswerMode({
      requested: 'auto',
      collectionIds: [USER_NB],
      userLocale: 'de-DE',
    });
    expect(out.decision).toEqual({ requested: 'auto', resolved: 'chat', reason: 'default' });
    expect(out.warning).toBeNull();
  });

  it('runs precision when asked for on a user notebook', async () => {
    const out = await resolveNotebookAnswerMode({
      requested: 'praezision',
      collectionIds: [USER_NB],
      userLocale: 'de-DE',
    });
    expect(out).toEqual({
      decision: { requested: 'praezision', resolved: 'praezision', reason: 'explicit' },
      warning: null,
    });
  });

  it('falls back to chat with a warning when no notebook is readable', async () => {
    const out = await resolveNotebookAnswerMode({
      requested: 'praezision',
      collectionIds: ['oesterreich-notebook'],
      userLocale: 'de-DE',
    });
    expect(out).toEqual({
      decision: { requested: 'praezision', resolved: 'chat', reason: 'ineligible' },
      warning: 'notebook_praezision_unavailable',
    });
  });

  it('marks auto on an unreadable page as ineligible, without a warning', async () => {
    const out = await resolveNotebookAnswerMode({
      requested: 'auto',
      collectionIds: [],
      userLocale: 'de-DE',
    });
    expect(out).toEqual({
      decision: { requested: 'auto', resolved: 'chat', reason: 'ineligible' },
      warning: null,
    });
  });
});

describe('isPraezisionEligible', () => {
  it('accepts user notebooks and single system collections of the locale', () => {
    expect(isPraezisionEligible([USER_NB], 'de-DE')).toBe(true);
    expect(isPraezisionEligible(['hamburg-notebook'], 'de-DE')).toBe(true);
    expect(isPraezisionEligible(['oesterreich-notebook'], 'de-AT')).toBe(true);
  });

  it('refuses another locale, a multi-collection slug and an empty page', () => {
    expect(isPraezisionEligible(['oesterreich-notebook'], 'de-DE')).toBe(false);
    expect(isPraezisionEligible(['gruenerator-notebook'], 'de-DE')).toBe(false);
    expect(isPraezisionEligible([], 'de-DE')).toBe(false);
  });

  it('is enough when one notebook of the page is readable', () => {
    expect(isPraezisionEligible(['gruenerator-notebook', USER_NB], 'de-DE')).toBe(true);
  });
});
