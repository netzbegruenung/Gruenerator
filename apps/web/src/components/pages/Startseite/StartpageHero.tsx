import {
  detectCountryProviderId,
  getProviderById,
  getRememberedProvider,
  rememberProvider,
  signInWithProvider,
  LOGIN_PROVIDERS,
  type LoginProviderId,
} from '@gruenerator/shared/auth';
import { memo, useCallback, useState } from 'react';

import './startpage-hero.css';

const HEADLINE = 'KI, die die Welt nicht brennen sehen will.';

interface HeroInit {
  /** Provider the Login button goes to: a remembered choice, else the browser language. */
  primary: LoginProviderId;
  /** Expand the provider list on load (only the ?login=<id> deep link). */
  openOnLoad: boolean;
}

// Everything needed is available synchronously on first render (CSR SPA), so we
// resolve it in a lazy initializer instead of an effect.
const resolveInit = (): HeroInit => {
  const special = new URLSearchParams(window.location.search).get('login');
  const deepLinked = LOGIN_PROVIDERS.some((p) => p.id === special)
    ? (special as LoginProviderId)
    : null;
  const primary = deepLinked ?? getRememberedProvider() ?? detectCountryProviderId();
  return { primary, openOnLoad: deepLinked !== null };
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
  const [{ primary, openOnLoad }] = useState(resolveInit);
  const [providersOpen, setProvidersOpen] = useState(openOnLoad);

  const startLogin = useCallback((id: LoginProviderId) => {
    const provider = getProviderById(id);
    if (!provider) return;
    rememberProvider(id);
    void signInWithProvider(provider, '/workplace').catch((err) => {
      console.error('[StartpageHero] Sign-in failed:', err);
    });
  }, []);

  const primaryProvider = getProviderById(primary);

  return (
    <>
      <div className="sp-sunrise" aria-hidden="true" />

      <section className="sp-hero">
        <div className="sp-topbar">
          <img
            src="/images/gruenerator_logo_gruen.svg"
            alt="Grünerator"
            className="sp-logo sp-logo-light"
          />
          <img
            src="/images/gruenerator_logo_weiss.svg"
            alt="Grünerator"
            aria-hidden="true"
            className="sp-logo sp-logo-dark"
          />
        </div>

        <h1 className="sr-only">Grünerator – die Grüne KI, exklusiv für Grüne Mitglieder</h1>

        <p className="sp-headline" aria-hidden="true">
          {HEADLINE}
        </p>

        <div className="sp-cta">
          <div
            className={`sp-collapse${providersOpen ? '' : ' sp-collapse-open'}`}
            aria-hidden={providersOpen}
          >
            <div className="sp-cta-row">
              <button
                type="button"
                className="sp-login"
                onClick={() => startLogin(primary)}
                aria-label={primaryProvider ? `Anmelden mit ${primaryProvider.title}` : 'Anmelden'}
              >
                <LockIcon /> Login
              </button>
              <button type="button" className="sp-more" onClick={onScrollToContent}>
                Mehr erfahren
              </button>
            </div>
          </div>

          <button
            type="button"
            className="sp-provider-toggle"
            onClick={() => setProvidersOpen((open) => !open)}
            aria-expanded={providersOpen}
          >
            {providersOpen ? 'Anbieter ausblenden' : 'Anderer Anbieter'}
          </button>

          <div
            className={`sp-collapse${providersOpen ? ' sp-collapse-open' : ''}`}
            aria-hidden={!providersOpen}
          >
            <ul className="sp-provider-list">
              {LOGIN_PROVIDERS.filter((provider) => provider.enabledByDefault).map((provider) => (
                <li key={provider.id}>
                  <button
                    type="button"
                    className="sp-provider"
                    aria-current={provider.id === primary ? 'true' : undefined}
                    onClick={() => startLogin(provider.id)}
                  >
                    {provider.logoPath ? (
                      <img src={provider.logoPath} alt="" className="sp-provider-logo" />
                    ) : (
                      <span className="sp-provider-logo" aria-hidden="true">
                        🌱
                      </span>
                    )}
                    {provider.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="sp-cue-wrap">
          <p className="sp-hint">
            Ein Projekt von Moritz Wächter, kostenfrei für alle Grünen Parteimitglieder in
            Deutschland und Österreich.
          </p>
          <button
            type="button"
            className="sp-cue"
            onClick={onScrollToContent}
            aria-label="Mehr erfahren"
          >
            <ChevronIcon />
          </button>
        </div>
      </section>
    </>
  );
});

StartpageHero.displayName = 'StartpageHero';

export default StartpageHero;
