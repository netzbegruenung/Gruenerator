/**
 * Die Ländererkennung vor dem Login.
 *
 * Der gemessene Fehlerfall steht ganz oben: ein österreichisches Gerät, dessen
 * Browser `de-DE` meldet. Österreich spricht Deutsch — die Sprache trennt die
 * beiden Länder praktisch nie, und genau daran scheiterte die alte Erkennung
 * (`navigator.language.includes('at')`), die jede solche Anmeldung nach
 * Deutschland schickte.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { detectCountry, detectCountryProviderId } from './loginProviders.js';

function withEnvironment(timeZone: string, languages: string[]) {
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
    resolvedOptions: () => ({ timeZone }),
  } as unknown as Intl.DateTimeFormat);

  vi.stubGlobal('navigator', { languages, language: languages[0] ?? 'de' });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('detectCountry', () => {
  it('erkennt Österreich an der Zeitzone, obwohl der Browser de-DE meldet', () => {
    withEnvironment('Europe/Vienna', ['de-DE', 'de']);
    expect(detectCountry()).toBe('at');
  });

  it('erkennt Österreich auch bei bloßem "de"', () => {
    withEnvironment('Europe/Vienna', ['de']);
    expect(detectCountry()).toBe('at');
  });

  it('erkennt Deutschland an der Zeitzone', () => {
    withEnvironment('Europe/Berlin', ['de-DE', 'de']);
    expect(detectCountry()).toBe('de');
  });

  // Ein ausdrückliches de-AT ist selten, aber eindeutig — es schlägt deshalb
  // auch eine abweichende Zeitzone (österreichisches Gerät auf Reisen).
  it('lässt ein ausdrückliches de-AT die Zeitzone überstimmen', () => {
    withEnvironment('Europe/Berlin', ['de-AT']);
    expect(detectCountry()).toBe('at');
  });

  it('gibt null zurück, wenn weder Zeitzone noch Sprache das Land verraten', () => {
    withEnvironment('Europe/Zurich', ['de-CH', 'de']);
    expect(detectCountry()).toBeNull();
  });

  it('gibt null zurück statt zu raten, wenn gar nichts bekannt ist', () => {
    withEnvironment('America/New_York', ['en-US']);
    expect(detectCountry()).toBeNull();
  });

  it('gibt null zurück, wenn die Zeitzone nicht lesbar ist', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('kein Intl');
    });
    vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' });
    expect(detectCountry()).toBeNull();
  });
});

describe('detectCountryProviderId', () => {
  it('bildet die Länder auf ihre Anbieter ab', () => {
    withEnvironment('Europe/Vienna', ['de-DE']);
    expect(detectCountryProviderId()).toBe('gruene-oesterreich');

    withEnvironment('Europe/Berlin', ['de-DE']);
    expect(detectCountryProviderId()).toBe('gruenes-netz');
  });

  // Der Kern des Fixes: Unsicherheit bleibt Unsicherheit. Wer hier einen
  // Standard einsetzte, hätte wieder eine stille Entscheidung für Deutschland.
  it('reicht die Unsicherheit als null weiter, statt Deutschland zu wählen', () => {
    withEnvironment('America/New_York', ['en-US']);
    expect(detectCountryProviderId()).toBeNull();
  });
});
