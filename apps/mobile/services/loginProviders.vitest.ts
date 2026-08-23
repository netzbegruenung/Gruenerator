import { describe, expect, it } from 'vitest';

import {
  LOGIN_PROVIDERS,
  PROVIDER_SOURCE,
  detectCountryProvider,
  orderedProviders,
  type LoginProviderId,
} from './loginProviders';

describe('PROVIDER_SOURCE', () => {
  // The Record type catches a *missing* line; only this catches a wrong one,
  // and a wrong one is silent: the OAuth round-trip starts, Keycloak answers
  // with the wrong realm's login form, and nothing in the app looks broken.
  it('sends what the shared registry says each provider is called', () => {
    for (const provider of LOGIN_PROVIDERS) {
      expect(PROVIDER_SOURCE[provider.id], provider.id).toBe(provider.source);
    }
  });

  it('covers the registry and nothing besides', () => {
    expect(Object.keys(PROVIDER_SOURCE).sort()).toEqual(LOGIN_PROVIDERS.map((p) => p.id).sort());
  });
});

describe('detectCountryProvider', () => {
  it.each([
    ['de-DE', 'Europe/Berlin', 'gruenes-netz'],
    ['de-AT', 'Europe/Vienna', 'gruene-oesterreich'],
    // Language alone. An Austrian phone set to plain `de` or even to `de-DE` is
    // the common case — the region subtag is the weaker of the two signals.
    ['de', 'Europe/Vienna', 'gruene-oesterreich'],
    ['de-DE', 'Europe/Vienna', 'gruene-oesterreich'],
    // Time zone alone: an Austrian member abroad keeps their de-AT phone.
    ['de-AT', 'Europe/Berlin', 'gruene-oesterreich'],
    // Underscores: Android hands out `de_AT` in some locale APIs.
    ['de_AT', 'Europe/Berlin', 'gruene-oesterreich'],
    // Neither signal, and the nothing-at-all case Intl can hand back.
    ['en-GB', 'Europe/London', 'gruenes-netz'],
    ['', '', 'gruenes-netz'],
  ])('%s / %s → %s', (locale, timeZone, expected) => {
    expect(detectCountryProvider(locale, timeZone)).toBe(expected);
  });

  // Web asks whether the whole tag *contains* "at", which it can afford: it
  // reads `navigator.language`, which is always short. Intl hands back full
  // tags, and `de-Latn-DE` contains "at" while having nothing to do with
  // Austria — hence the region subtag rather than a substring.
  it('reads the region subtag, not any "at" in the tag', () => {
    expect(detectCountryProvider('de-Latn-DE', 'Europe/Berlin')).toBe('gruenes-netz');
  });
});

describe('orderedProviders', () => {
  it('puts the detected provider first and keeps the rest', () => {
    const ordered = orderedProviders('gruene-oesterreich');
    expect(ordered[0]?.id).toBe('gruene-oesterreich');
    expect(ordered).toHaveLength(LOGIN_PROVIDERS.length);
  });

  it('offers every provider, including the ones web hides behind ?provider=', () => {
    const ids = orderedProviders('gruenes-netz').map((p) => p.id);
    expect(ids).toContain('netzbegruenung');
    expect(ids).toContain('gruenerator');
  });

  it('drops nobody when the primary is not in the registry', () => {
    const ordered = orderedProviders('nicht-da' as LoginProviderId);
    expect(ordered.map((p) => p.id)).toEqual(LOGIN_PROVIDERS.map((p) => p.id));
  });
});
