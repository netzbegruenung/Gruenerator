/**
 * Barrierefreiheit & Hilfe — zwei Hälften in einem Bereich (#2387).
 *
 * Support war ein eigener Reiter mit null Einstellungen: zwei Kontaktwege in
 * statischem Text. Er kostete einen Eintrag in einer ohnehin langen
 * Seitenleiste und stand am Ende neben „Nutzung" — dem anderen Bereich, den man
 * nur liest. Zusammengelegt wurde hierher, nicht umgekehrt: an
 * `barrierefreiheit` hängen die Katalog-Zeilen, die auch die App über
 * `getSettingsEntry` liest, an `support` hing nichts. `/settings/support` führt
 * weiter hierher, siehe SETTINGS_TAB_MAP in SettingsRedirect.tsx.
 *
 * Überschriften-Ebenen: der Dialog setzt die h2 (das Reiter-Label), „Support"
 * ist die h3 darunter, die beiden Kontaktwege sind h4.
 */
import { Switch } from '@gruenerator/ui';

import SettingsRow from '../components/SettingsRow';

import { useAuthStore } from '@/stores/authStore';

const AccessibilityTab = () => {
  const reduceMotion = useAuthStore((s) => s.user?.reduce_motion ?? false);
  const reduceTransparency = useAuthStore((s) => s.user?.reduce_transparency ?? false);
  const updateA11yPreference = useAuthStore((s) => s.updateA11yPreference);

  return (
    <div className="flex flex-col gap-lg">
      <div className="-my-4 divide-y divide-grey-200 dark:divide-grey-800">
        <SettingsRow id="barrierefreiheit.animationen">
          <Switch
            checked={reduceMotion}
            onCheckedChange={(checked) => void updateA11yPreference('reduce_motion', checked)}
            aria-label="Animationen reduzieren"
          />
        </SettingsRow>

        <SettingsRow id="barrierefreiheit.transparenz">
          <Switch
            checked={reduceTransparency}
            onCheckedChange={(checked) => void updateA11yPreference('reduce_transparency', checked)}
            aria-label="Transparenz und Unschärfe reduzieren"
          />
        </SettingsRow>
      </div>

      <hr className="m-0 border-grey-200 dark:border-grey-700" />

      <section className="flex flex-col gap-lg text-sm leading-relaxed text-foreground">
        <div className="flex flex-col gap-xs">
          <h3 className="m-0 text-sm font-medium uppercase tracking-wide text-grey-600 dark:text-grey-300">
            Support
          </h3>
          <p className="m-0 text-grey-500 dark:text-grey-400">
            Fragen zum Grünerator oder Unterstützung nötig? Diese Wege stehen dir offen.
          </p>
        </div>

        <div className="flex flex-col gap-xs">
          <h4 className="m-0 text-sm font-medium text-foreground">Chat Begrünung</h4>
          <p className="m-0 text-grey-500 dark:text-grey-400">
            Der schnellste Weg: unser Support-Kanal im Chat Begrünung — Fragen stellen, Probleme
            melden, mit anderen Nutzer*innen austauschen.
          </p>
          <a
            href="https://chatbegruenung.de/channel/Gruenerator"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            → Zum Grünerator Support-Kanal
          </a>
        </div>

        <div className="flex flex-col gap-xs">
          <h4 className="m-0 text-sm font-medium text-foreground">E-Mail (Österreich)</h4>
          <p className="m-0 text-grey-500 dark:text-grey-400">
            Nutzer*innen aus Österreich können sich direkt per E-Mail an uns wenden:
          </p>
          <a
            href="mailto:info@moritz-waechter.de"
            className="font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            info@moritz-waechter.de
          </a>
        </div>
      </section>
    </div>
  );
};

export default AccessibilityTab;
