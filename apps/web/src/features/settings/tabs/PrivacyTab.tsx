/**
 * Datenschutz-Einstellungen: Widerruf der Reichweitenmessung und der
 * Art.-9-Einwilligung.
 *
 * Die Datenschutzerklärung sagt beides ausdrücklich zu — die Umami-Einwilligung
 * sei „über die Datenschutz-Einstellungen der Plattform" widerrufbar, die
 * Art.-9-Einwilligung „jederzeit mit Wirkung für die Zukunft". Vorher gab es
 * dafür nur den Weg über die Browser-Einstellungen (localStorage-Eintrag
 * löschen), was die Zusage nicht einlöst.
 */

import { Switch } from '@gruenerator/ui';
import { useSyncExternalStore } from 'react';

import SettingsRow from '../components/SettingsRow';

import { useAuthStore } from '@/stores/authStore';

const ANALYTICS_CONSENT_KEY = 'analyticsConsent';

/**
 * Der Umami-Ladepfad liegt in `index.html` und liest denselben Schlüssel vor dem
 * ersten Paint; deshalb bleibt der localStorage die Quelle der Wahrheit und
 * diese Zeile spiegelt ihn nur. `window.grant/revokeAnalyticsConsent` laden
 * bzw. entfernen das Skript per Reload — genau das, was der Widerruf braucht.
 */
function subscribeToAnalyticsConsent(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

function readAnalyticsConsent(): boolean {
  try {
    return localStorage.getItem(ANALYTICS_CONSENT_KEY) === 'true';
  } catch {
    return false;
  }
}

const PrivacyTab = () => {
  const analyticsConsent = useSyncExternalStore(
    subscribeToAnalyticsConsent,
    readAnalyticsConsent,
    () => false
  );

  const aiConsentAt = useAuthStore((s) => s.user?.ai_consent_at ?? null);
  const setAiConsent = useAuthStore((s) => s.setAiConsent);

  const toggleAnalytics = (checked: boolean) => {
    if (checked) window.grantAnalyticsConsent?.();
    else window.revokeAnalyticsConsent?.();
  };

  return (
    <div className="-my-4 divide-y divide-grey-200 dark:divide-grey-800">
      <SettingsRow id="datenschutz.reichweitenmessung">
        <Switch
          checked={analyticsConsent}
          onCheckedChange={toggleAnalytics}
          aria-label="Reichweitenmessung mit Umami erlauben"
        />
      </SettingsRow>

      <SettingsRow id="datenschutz.ki-einwilligung">
        <Switch
          checked={aiConsentAt != null}
          onCheckedChange={(checked) => void setAiConsent(checked)}
          aria-label="Einwilligung in die Verarbeitung besonderer Kategorien"
        />
      </SettingsRow>

      <div className="py-4 text-xs text-grey-500 dark:text-grey-400">
        {aiConsentAt != null && (
          <p className="m-0 mb-2">
            Einwilligung erteilt am{' '}
            {new Date(aiConsentAt).toLocaleDateString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
            .
          </p>
        )}
        <p className="m-0">
          Ohne diese Einwilligung kannst du die KI-Funktionen nicht nutzen: nimmst du sie zurück,
          steht sofort wieder die Einwilligungsabfrage da — dort kannst du erneut einwilligen oder
          dich abmelden. Was wir verarbeiten, steht in der{' '}
          <a href="/datenschutz" className="underline">
            Datenschutzerklärung
          </a>
          .
        </p>
      </div>
    </div>
  );
};

export default PrivacyTab;
