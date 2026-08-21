/**
 * Die Regeln des öffentlichen Vorlagen-Endpunkts sind seine gesamte
 * Sicherheitsfläche. Zwei Verwechslungen wären teuer und beide sähen im Betrieb
 * harmlos aus: „privat" als `needs_login` statt `hidden` verrät Fremden, dass es
 * die Vorlage gibt; „öffentlich" als `needs_login` verlangt für einen Link ein
 * Konto, der ohne eines gedacht war.
 */
import { describe, expect, it } from 'vitest';

import { resolveSharedTemplateAccess } from './sharedTemplateAccess.js';

const anonymous = { isOwner: false, isAnonymous: true };
const strangerLoggedIn = { isOwner: false, isAnonymous: false };
const owner = { isOwner: true, isAnonymous: false };

describe('resolveSharedTemplateAccess', () => {
  it('lässt einen öffentlichen Link ohne Anmeldung durch', () => {
    expect(
      resolveSharedTemplateAccess({ share_mode: 'public', is_public: true }, anonymous)
    ).toEqual({ kind: 'ok', shareMode: 'public' });
  });

  it('erkennt einen öffentlichen Link auch allein an is_public', () => {
    // checkDirectAccess liest is_public, nicht share_mode — ältere Zeilen
    // können das eine ohne das andere tragen.
    expect(resolveSharedTemplateAccess({ share_mode: null, is_public: true }, anonymous)).toEqual({
      kind: 'ok',
      shareMode: 'public',
    });
  });

  it('verlangt für einen angemeldeten Link ein Konto', () => {
    expect(
      resolveSharedTemplateAccess({ share_mode: 'authenticated', is_public: false }, anonymous)
    ).toEqual({ kind: 'needs_login' });
  });

  it('lässt angemeldete Fremde auf einen angemeldeten Link', () => {
    expect(
      resolveSharedTemplateAccess(
        { share_mode: 'authenticated', is_public: false },
        strangerLoggedIn
      )
    ).toEqual({ kind: 'ok', shareMode: 'authenticated' });
  });

  it('versteckt eine private Vorlage vor Fremden — auch vor angemeldeten', () => {
    expect(
      resolveSharedTemplateAccess({ share_mode: 'private', is_public: false }, anonymous)
    ).toEqual({ kind: 'hidden' });
    expect(
      resolveSharedTemplateAccess({ share_mode: 'private', is_public: false }, strangerLoggedIn)
    ).toEqual({ kind: 'hidden' });
  });

  it('behandelt eine Zeile ohne share_mode als privat', () => {
    expect(
      resolveSharedTemplateAccess({ share_mode: null, is_public: null }, strangerLoggedIn)
    ).toEqual({ kind: 'hidden' });
  });

  it('zeigt der Besitzerin ihre private Vorlage im engeren Modus', () => {
    expect(resolveSharedTemplateAccess({ share_mode: 'private', is_public: false }, owner)).toEqual(
      {
        kind: 'ok',
        shareMode: 'authenticated',
      }
    );
  });
});
