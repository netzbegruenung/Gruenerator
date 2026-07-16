import {
  detectCountryProviderId,
  getProviderById,
  getRememberedProvider,
  rememberProvider,
  signInWithProvider,
  type CountryProviderId,
  type LoginProviderId,
} from '@gruenerator/shared/auth';
import { memo, useCallback, useState } from 'react';

import './startpage-hero.css';

const HEADLINE = 'KI, die die Welt nicht brennen sehen will.';

const COUNTRY_LABEL: Record<CountryProviderId, string> = {
  'gruenes-netz': 'Deutschland',
  'gruene-oesterreich': 'Österreich',
};

const otherCountry = (id: CountryProviderId): CountryProviderId =>
  id === 'gruenes-netz' ? 'gruene-oesterreich' : 'gruenes-netz';

interface HeroInit {
  /** Country provider pre-selected from a remembered choice, else the browser language. */
  detected: CountryProviderId;
  /** Surface the Netzbegrünung button (special link, or a returning nb user). */
  showNetz: boolean;
  /** Open the login state straight away (only the ?login=netzbegruenung deep link). */
  openOnLoad: boolean;
}

// Everything needed is available synchronously on first render (CSR SPA), so we
// resolve it in a lazy initializer instead of an effect.
const resolveInit = (): HeroInit => {
  const special = new URLSearchParams(window.location.search).get('login');
  const remembered = getRememberedProvider();
  const detected: CountryProviderId =
    remembered === 'gruenes-netz' || remembered === 'gruene-oesterreich'
      ? remembered
      : detectCountryProviderId();
  const showNetz = special === 'netzbegruenung' || remembered === 'netzbegruenung';
  return { detected, showNetz, openOnLoad: special === 'netzbegruenung' };
};

const LockIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ChevronIcon = () => (
  <svg
    className="sp-cue-chev"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

interface StartpageHeroProps {
  onScrollToContent: () => void;
}

const StartpageHero = memo(({ onScrollToContent }: StartpageHeroProps) => {
  // Netzbegrünung is hidden by default; surfaced only via the special link
  // (?login=netzbegruenung) or for a returning user who chose it before.
  const [{ detected, showNetz, openOnLoad }] = useState(resolveInit);
  const [loginOpen, setLoginOpen] = useState(openOnLoad);

  const startLogin = useCallback((id: LoginProviderId) => {
    const provider = getProviderById(id);
    if (!provider) return;
    rememberProvider(id);
    void signInWithProvider(provider, '/workplace').catch((err) => {
      console.error('[StartpageHero] Sign-in failed:', err);
    });
  }, []);

  const other = otherCountry(detected);

  return (
    <>
      <div className="sp-sunrise" aria-hidden="true" />
      <div className={`sp-sunrise-warm${loginOpen ? ' is-on' : ''}`} aria-hidden="true" />

      <section className={`sp-hero${loginOpen ? ' is-login' : ''}`}>
        <div className="sp-topbar">
          <span className="sp-wordmark">
            Grünerator<span className="sp-wordmark-dot">.</span>
          </span>
          <span className="sp-eyebrow">KI für die Grünen</span>
        </div>

        <h1 className="sr-only">Grünerator – die Grüne KI, exklusiv für Grüne Mitglieder</h1>

        <p className="sp-headline" aria-hidden="true">
          {loginOpen ? `Loggst du dich aus ${COUNTRY_LABEL[detected]} ein?` : HEADLINE}
        </p>

        {loginOpen ? (
          <div className="sp-cta">
            <div className="sp-providers">
              {showNetz ? (
                <button
                  type="button"
                  className="sp-provider"
                  onClick={() => startLogin('netzbegruenung')}
                >
                  <LockIcon /> Netzbegrünung Login
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="sp-provider"
                    onClick={() => startLogin(detected)}
                  >
                    Ja, {COUNTRY_LABEL[detected]}
                  </button>
                  <button type="button" className="sp-provider" onClick={() => startLogin(other)}>
                    Nein, {COUNTRY_LABEL[other]}
                  </button>
                </>
              )}
            </div>
            <button type="button" className="sp-back" onClick={() => setLoginOpen(false)}>
              Zurück
            </button>
          </div>
        ) : (
          <div className="sp-cta">
            <div className="sp-cta-row">
              <button
                type="button"
                className="sp-login"
                onClick={() => setLoginOpen(true)}
                aria-label="Anmelden"
              >
                <LockIcon /> Login
              </button>
              <button type="button" className="sp-more" onClick={onScrollToContent}>
                Mehr erfahren
              </button>
            </div>
            <p className="sp-hint">Exklusiv für Grüne Mitglieder.</p>
          </div>
        )}

        {!loginOpen && (
          <button
            type="button"
            className="sp-cue"
            onClick={onScrollToContent}
            aria-label="Mehr erfahren"
          >
            <ChevronIcon />
          </button>
        )}
      </section>
    </>
  );
});

StartpageHero.displayName = 'StartpageHero';

export default StartpageHero;
