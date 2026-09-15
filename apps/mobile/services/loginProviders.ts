import {
  LOGIN_PROVIDERS,
  type CountryProviderId,
  type LoginProvider,
  type LoginProviderId,
} from '@gruenerator/shared/auth/loginProviders';

export { LOGIN_PROVIDERS };
export type { CountryProviderId, LoginProvider, LoginProviderId };

/**
 * Which `?source=` value starts each provider's OAuth flow.
 *
 * The shared registry already carries these strings in `provider.source`, but
 * types them as a bare `string`, so a value read off it cannot be handed to
 * `login()` without an assertion. This table is that assertion — and it is
 * checked from both sides: `Record<LoginProviderId, string>` stops compiling
 * when a provider is added upstream without a line here, and
 * `loginProviders.vitest.ts` fails when a line here drifts from the registry's
 * own `source`. Sent over the wire and read by the auth route, so F0: the
 * strings themselves are not renameable.
 */
export const PROVIDER_SOURCE = {
  'gruenes-netz': 'gruenes-netz-login',
  'gruene-oesterreich': 'gruene-oesterreich-login',
  netzbegruenung: 'netzbegruenung-login',
  gruenerator: 'gruenerator-login',
} as const satisfies Record<LoginProviderId, string>;

/**
 * Lives here rather than next to `login()` so that the country detection below
 * — the one piece of login logic worth testing — stays in a module the node
 * test lane can import. `services/auth.ts` re-exports it for its old callers.
 */
export type AuthSource = (typeof PROVIDER_SOURCE)[LoginProviderId];

/**
 * Whose login to offer first, from what the device already says.
 *
 * Web reads `navigator.language`; React Native has no such field — its
 * `navigator` polyfill carries `product` and `userAgent` and nothing else — so
 * the same question is answered from Hermes' `Intl`, which the app already uses
 * for date formatting and which costs no native module.
 *
 * Two signals rather than one, because they fail in opposite directions: an
 * Austrian phone is often set to plain `de`, or to `de-DE` outright, while its
 * time zone says Europe/Vienna no matter the language; a German phone
 * travelling through Vienna keeps its `de-DE`. Either signal pointing at
 * Austria is enough to offer Austria first — the choice is never final, since
 * every provider stays one tap away under "Weitere Anbieter".
 */
export function detectCountryProvider(locale: string, timeZone: string): CountryProviderId {
  // Nicht schlicht das zweite Teilstück: ein Skript-Subtag schiebt sich dazwischen
  // (`de-Latn-AT`), und dann wäre die Region „latn". Gesucht ist die Form einer
  // Region — zwei Buchstaben oder die dreistellige UN-M49-Zahl.
  const region =
    locale
      .toLowerCase()
      .split(/[-_]/)
      .slice(1)
      .find((subtag) => /^[a-z]{2}$/.test(subtag) || /^\d{3}$/.test(subtag)) ?? '';
  const austrian = region === 'at' || timeZone === 'Europe/Vienna';
  return austrian ? 'gruene-oesterreich' : 'gruenes-netz';
}

/** {@link detectCountryProvider}, asked of this device. Falls back to Germany. */
export function deviceCountryProvider(): CountryProviderId {
  try {
    const resolved = new Intl.DateTimeFormat().resolvedOptions();
    return detectCountryProvider(resolved.locale ?? '', resolved.timeZone ?? '');
  } catch {
    return 'gruenes-netz';
  }
}

/**
 * Anbieter, die erst nach dem Freischalt-Griff erscheinen (siehe
 * `app/(auth)/login.tsx`).
 *
 * Nur `gruenerator` steht hier, nicht die zwei, die Web hinter `?provider=`
 * versteckt: Netzbegrünung bleibt sichtbar, weil ein Telefon keine Adresszeile
 * hat und diese Konten sonst gar nicht mehr in die App kämen. Der
 * Grünerator-Login ist der einzige Weg auf ein Keycloak-Formular mit
 * Benutzername und Passwort — brauchbar für die App-Review, verwirrend für die
 * Mitglieder, die so ein Konto nicht haben.
 *
 * Sollte der Anbieter je wieder regulär in Betrieb gehen (er gilt laut
 * `apps/api/config/localeSync.ts` als derzeit ungenutzt), gehört er hier
 * heraus — nicht ein zweiter Griff daneben.
 */
export const GATED_PROVIDERS: readonly LoginProviderId[] = ['gruenerator'];

/**
 * The provider list as the sheet shows it: the detected one first, the rest
 * behind it in registry order.
 *
 * Nicht web's Default-Menge: Netzbegrünung bleibt drin (Begründung an
 * {@link GATED_PROVIDERS}), nur die dort genannten fallen weg, bis
 * `showGated` sie hereinholt.
 *
 * Ein gesperrter `primary` würde die Liste um genau diesen Eintrag kürzen —
 * kann heute nicht vorkommen, weil `deviceCountryProvider` ausschließlich
 * Länder-Anbieter liefert, und ist als Verhalten das richtige: die Sperre
 * wiegt schwerer als die Vorauswahl.
 */
export function orderedProviders(primary: LoginProviderId, showGated = false): LoginProvider[] {
  const visible = showGated
    ? LOGIN_PROVIDERS
    : LOGIN_PROVIDERS.filter((p) => !GATED_PROVIDERS.includes(p.id));
  const first = visible.filter((p) => p.id === primary);
  return [...first, ...visible.filter((p) => p.id !== primary)];
}
