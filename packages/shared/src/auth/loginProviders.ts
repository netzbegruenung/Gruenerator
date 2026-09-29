export type LoginProviderId =
  'gruenes-netz' | 'gruene-oesterreich' | 'netzbegruenung' | 'gruenerator';

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
    // Das Land gehört sichtbar ins Label: die Anbieternamen allein sagen niemandem,
    // welcher Knopf der österreichische ist, und die Wahl legt hinterher Ansprache,
    // Notebook-Sammlungen und Parteinamen fest.
    description: 'Für Deutschland — mit deinem Grünes-Netz-Account anmelden',
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
    description: 'Für Österreich — mit deinem Groupware-Account (Zimbra) anmelden',
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
    // Only reachable via the special link (?provider=netzbegruenung); hidden
    // from the default provider set on both the start page and /login.
    enabledByDefault: false,
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
    // Like netzbegruenung: not offered anywhere in the web frontend, reachable
    // only via the deep link /login?login=gruenerator (which makes it the
    // primary provider and re-adds it to the expanded list).
    enabledByDefault: false,
  },
];

/** localStorage key for the provider a user last logged in with. */
export const REMEMBERED_PROVIDER_KEY = 'gruenerator.loginProvider';

/** The two country providers the start page auto-detects between. */
export type CountryProviderId = 'gruenes-netz' | 'gruene-oesterreich';

export function getProviderById(id: LoginProviderId): LoginProvider | undefined {
  return LOGIN_PROVIDERS.find((p) => p.id === id);
}

/** Read the remembered provider id from localStorage (null if none/invalid/unavailable). */
export function getRememberedProvider(): LoginProviderId | null {
  try {
    const raw = localStorage.getItem(REMEMBERED_PROVIDER_KEY);
    return LOGIN_PROVIDERS.some((p) => p.id === raw) ? (raw as LoginProviderId) : null;
  } catch {
    return null;
  }
}

/** Persist the provider a user chose so we can pre-select it on return. */
export function rememberProvider(id: LoginProviderId): void {
  try {
    localStorage.setItem(REMEMBERED_PROVIDER_KEY, id);
  } catch {
    // storage unavailable (private mode / disabled) — non-fatal
  }
}

/**
 * Ländererkennung vor dem Login — die Zeitzone trägt sie, nicht die Sprache.
 *
 * Vorher entschied `navigator.language.includes('at')`. Österreich spricht
 * Deutsch, und österreichische Geräte melden ganz überwiegend `de-DE` oder
 * schlicht `de`: die Sprache unterscheidet die beiden Länder praktisch nie, und
 * jede Anmeldung landete auf dem deutschen IdP. `Europe/Vienna` dagegen steht
 * auf einem in Österreich eingerichteten Gerät, ist ohne Nachfrage lesbar und
 * hängt nicht daran, welche Sprache jemand eingestellt hat.
 *
 * Rückgabe `null` heißt „unsicher" und ist eine echte Antwort: die Login-Seite
 * zeigt dann beide Länder gleichrangig, statt eines stillschweigend zu wählen.
 * Zeitzonen außerhalb von DE/AT (Reise, VPN, Server-Rendering) sind genau der
 * Fall, in dem Raten schadet.
 */
export function detectCountry(): 'de' | 'at' | null {
  const timeZone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      return '';
    }
  })();

  const languages =
    typeof navigator !== 'undefined'
      ? navigator.languages?.length
        ? navigator.languages
        : [navigator.language]
      : [];
  const speaksAt = languages.some((l) => l?.toLowerCase().startsWith('de-at'));

  // Ein ausdrückliches de-AT ist selten, aber wenn es dasteht, ist es eindeutig —
  // es schlägt deshalb auch eine abweichende Zeitzone (AT-Gerät auf Reisen).
  if (timeZone === 'Europe/Vienna' || speaksAt) return 'at';
  if (timeZone === 'Europe/Berlin' || timeZone === 'Europe/Busingen') return 'de';
  return null;
}

const COUNTRY_PROVIDER: Record<'de' | 'at', CountryProviderId> = {
  de: 'gruenes-netz',
  at: 'gruene-oesterreich',
};

/**
 * Der vorzuschlagende Länder-Anbieter, oder `null`, wenn das Land unklar ist.
 * Aufrufer müssen `null` behandeln, indem sie fragen — nicht, indem sie einen
 * Standard einsetzen.
 */
export function detectCountryProviderId(): CountryProviderId | null {
  const country = detectCountry();
  return country === null ? null : COUNTRY_PROVIDER[country];
}

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
 * Die signierten Parameter, mit denen `/oauth2/authorize` auf Login- und
 * Zustimmungsseite umleitet, als `oauth_query` für den nächsten POST — oder
 * `null`, wenn die Seite nicht aus einem OAuth-Flow kommt.
 *
 * Ohne diesen Wert verliert better-auth 1.7 den Flow: der Login landet auf der
 * Startseite statt zurück bei `authorize`, und `/oauth2/consent` antwortet
 * `missing oauth query`. Das Client-Plugin `oauthProviderClient()` hängt ihn an
 * jeden POST an, deckt aber unseren direkten `fetch` nicht ab. Die Auswahl ist
 * die aus seinem `buildSignedOAuthQuery`, das die Bibliothek nicht exportiert:
 * die Signatur deckt genau die in `ba_param` genannten Parameter, jeder weitere
 * Parameter auf der Seite würde sie brechen.
 */
export function signedOAuthQuery(search: string): string | null {
  const params = new URLSearchParams(search);
  const signedNames = new Set(params.getAll('ba_param'));
  if (!params.has('sig') || signedNames.size === 0) return null;
  const signed = new URLSearchParams();
  for (const [key, value] of params) {
    if (key === 'sig' || key === 'ba_param' || signedNames.has(key)) signed.append(key, value);
  }
  return signed.toString();
}

/**
 * Initiate Better Auth OAuth sign-in.
 * POSTs to /api/auth/v2/sign-in/social, gets { url }, and redirects.
 *
 * Der Endpunkt hat sich mit better-auth 1.7 geaendert (`/sign-in/oauth2` ist
 * weg, das Feld heisst `provider` statt `providerId`). Das ist unkritisch,
 * weil dieser Pfad nur der Browser geht und Frontend und Backend zusammen
 * ausgeliefert werden — Mobile und Desktop gehen ueber `/api/auth/login`.
 */
export async function signInWithProvider(
  provider: LoginProvider,
  callbackURL: string,
  apiBaseUrl = '/api'
): Promise<void> {
  // Kommt der Login aus einem OAuth-Flow (MCP-Konnektor, Excel-Add-in), setzt
  // better-auth ihn nach dem Keycloak-Rückweg bei `authorize` fort.
  const oauthQuery = signedOAuthQuery(window.location.search);
  const response = await fetch(`${apiBaseUrl}/auth/v2/sign-in/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      provider: provider.betterAuthProviderId,
      callbackURL,
      ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
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
