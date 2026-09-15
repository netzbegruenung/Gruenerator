import { describe, expect, it } from 'vitest';

import {
  GATED_PROVIDERS,
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

  // Mit Skript-Subtag rutscht die Region auf die dritte Stelle. Selten, aber
  // wer sie dort verpasst, hält ein österreichisches Telefon für ein deutsches.
  it('findet die region auch hinter einem skript-subtag', () => {
    expect(detectCountryProvider('de-Latn-AT', 'Europe/Berlin')).toBe('gruene-oesterreich');
    expect(detectCountryProvider('de-Latn-DE', 'Europe/Berlin')).toBe('gruenes-netz');
  });
});

describe('orderedProviders', () => {
  const ungated = LOGIN_PROVIDERS.filter((p) => !GATED_PROVIDERS.includes(p.id));

  it('puts the detected provider first and keeps the rest', () => {
    const ordered = orderedProviders('gruene-oesterreich');
    expect(ordered[0]?.id).toBe('gruene-oesterreich');
    expect(ordered).toHaveLength(ungated.length);
  });

  // Netzbegrünung ist NICHT gesperrt, und das ist der Kern der Trennung: Web
  // versteckt beide hinter `?provider=`, ein Telefon hat aber keine
  // Adresszeile — versteckt hieße hier ausgesperrt.
  it('zeigt netzbegruenung, obwohl web es hinter ?provider= versteckt', () => {
    expect(orderedProviders('gruenes-netz').map((p) => p.id)).toContain('netzbegruenung');
  });

  it('lässt den gesperrten anbieter weg, solange nicht freigeschaltet ist', () => {
    expect(orderedProviders('gruenes-netz').map((p) => p.id)).not.toContain('gruenerator');
  });

  it('holt ihn herein, sobald freigeschaltet ist', () => {
    const ids = orderedProviders('gruenes-netz', true).map((p) => p.id);
    expect(ids).toContain('gruenerator');
    expect(ids).toHaveLength(LOGIN_PROVIDERS.length);
  });

  // Sonst wäre die Sperre eine Umsortierung: der Anbieter bliebe in der Liste
  // und stünde nur woanders.
  it('hält die reihenfolge der übrigen bei, wenn der gesperrte fehlt', () => {
    expect(orderedProviders('gruenes-netz').map((p) => p.id)).toEqual(ungated.map((p) => p.id));
  });

  it('drops nobody besides the gated ones when the primary is not in the registry', () => {
    const ordered = orderedProviders('nicht-da' as LoginProviderId);
    expect(ordered.map((p) => p.id)).toEqual(ungated.map((p) => p.id));
  });
});
