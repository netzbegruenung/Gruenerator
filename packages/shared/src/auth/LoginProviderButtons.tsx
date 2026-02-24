import { type JSX } from 'react';

import {
  LOGIN_PROVIDERS,
  buildProviderAuthUrl,
  type LoginProvider,
  type LoginProviderId,
} from './loginProviders';
import './login-providers.css';

export interface LoginProvidersProps {
  /** Which providers to show. Defaults to all providers with `enabledByDefault: true`. */
  enabledProviders?: LoginProviderId[];
  /** URL to redirect to after successful login */
  redirectTo?: string;
  /** Base URL for the auth API (default: '/api') */
  apiBaseUrl?: string;
  /** Disable all buttons (e.g. while redirecting) */
  disabled?: boolean;
  /** Called before redirect — return `false` to cancel. Use for setting loading/intent state. */
  onBeforeLogin?: (provider: LoginProvider) => boolean | void;
  /** Override the default redirect behavior (window.location.href) */
  onLogin?: (provider: LoginProvider, authUrl: string) => void;
}

export function LoginProviders({
  enabledProviders,
  redirectTo,
  apiBaseUrl = '/api',
  disabled = false,
  onBeforeLogin,
  onLogin,
}: LoginProvidersProps): JSX.Element {
  const providers = enabledProviders
    ? LOGIN_PROVIDERS.filter((p) => enabledProviders.includes(p.id))
    : LOGIN_PROVIDERS.filter((p) => p.enabledByDefault);

  const handleClick = (provider: LoginProvider) => {
    if (onBeforeLogin) {
      const result = onBeforeLogin(provider);
      if (result === false) return;
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
    const authUrl = buildProviderAuthUrl(provider, redirectTo, apiBaseUrl, origin);

    if (onLogin) {
      onLogin(provider, authUrl);
    } else {
      window.location.href = authUrl;
    }
  };

  return (
    <div className="login-options">
      {providers.map((provider) => (
        <button
          key={provider.id}
          className={`login-option ${provider.className}`}
          onClick={() => handleClick(provider)}
          disabled={disabled}
        >
          <div className="login-content">
            {provider.logoPath ? (
              <img
                src={provider.logoPath}
                alt={provider.logoAlt}
                className="login-logo"
                width="50"
                height="50"
                loading="eager"
              />
            ) : (
              <span className="login-icon">🌱</span>
            )}
            <div className="login-text-content">
              <h3 className="login-title">{provider.title}</h3>
              <p className="login-description">{provider.description}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
