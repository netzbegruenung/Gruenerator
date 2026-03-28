export type LoginProviderId =
  | 'gruenes-netz'
  | 'gruene-oesterreich'
  | 'netzbegruenung'
  | 'gruenerator';

export interface LoginProvider {
  id: LoginProviderId;
  /** Value sent as `?source=` to the auth endpoint */
  source: string;
  /** Better Auth genericOAuth provider ID */
  betterAuthProviderId: string;
  title: string;
  description: string;
  /** CSS class applied to the button for provider-specific hover colors */
  className: string;
  /** Path to the logo image (relative to app's public dir), or null for emoji fallback */
  logoPath: string | null;
  logoAlt: string;
  /** Whether this provider is shown by default when no explicit filter is given */
  enabledByDefault: boolean;
}

export const LOGIN_PROVIDERS: LoginProvider[] = [
  {
    id: 'gruenes-netz',
    source: 'gruenes-netz-login',
    betterAuthProviderId: 'keycloak-gruenes-netz',
    title: 'Grünes Netz Login',
    description: 'Mit deinem Grünes Netz Account anmelden',
    className: 'gruenes-netz',
    logoPath: '/images/Sonnenblume_RGB_gelb.png',
    logoAlt: 'Grünes Netz',
    enabledByDefault: true,
  },
  {
    id: 'gruene-oesterreich',
    source: 'gruene-oesterreich-login',
    betterAuthProviderId: 'keycloak-gruene-at',
    title: 'Die Grünen – Die Grüne Alternative',
    description: 'Mit deinem Groupware Account (Zimbra) anmelden',
    className: 'gruene-oesterreich',
    logoPath: '/images/Grüne_at_Logo.svg.png',
    logoAlt: 'Die Grünen – Die Grüne Alternative',
    enabledByDefault: true,
  },
  {
    id: 'netzbegruenung',
    source: 'netzbegruenung-login',
    betterAuthProviderId: 'keycloak-netzbegruenung',
    title: 'Netzbegrünung Login',
    description: 'Mit deinem Netzbegrünung Account anmelden',
    className: 'netzbegruenung',
    logoPath: '/images/nb_icon.png',
    logoAlt: 'Netzbegrünung',
    enabledByDefault: true,
  },
  {
    id: 'gruenerator',
    source: 'gruenerator-login',
    betterAuthProviderId: 'keycloak-gruenerator',
    title: 'Grünerator Login',
    description: 'Für Mitarbeitende von Abgeordneten und Geschäftsstellen',
    className: 'gruenerator',
    logoPath: null,
    logoAlt: 'Grünerator',
    enabledByDefault: false,
  },
];

/** @deprecated Use signInWithProvider() for Better Auth flow */
export function buildProviderAuthUrl(
  provider: LoginProvider,
  redirectTo?: string,
  apiBaseUrl = '/api',
  origin?: string
): string {
  const params = new URLSearchParams({ source: provider.source });
  if (redirectTo) {
    params.set('redirectTo', redirectTo);
  }
  if (origin) {
    params.set('origin', origin);
  }
  return `${apiBaseUrl}/auth/login?${params.toString()}`;
}

/**
 * Initiate Better Auth OAuth sign-in.
 * POSTs to /api/auth/v2/sign-in/oauth2, gets { url }, and redirects.
 */
export async function signInWithProvider(
  provider: LoginProvider,
  callbackURL: string,
  apiBaseUrl = '/api'
): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/auth/v2/sign-in/oauth2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      providerId: provider.betterAuthProviderId,
      callbackURL,
    }),
  });

  if (!response.ok) {
    throw new Error(`OAuth sign-in failed: ${response.status}`);
  }

  const data = (await response.json()) as { url: string; redirect: boolean };
  if (data.url) {
    window.location.href = data.url;
  }
}
