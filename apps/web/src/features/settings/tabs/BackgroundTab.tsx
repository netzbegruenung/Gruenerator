import { type ChatBackground } from '@gruenerator/contracts';
import { Check } from 'lucide-react';

import { getSettingsEntry } from '../settingsCatalog';

import {
  CHAT_BACKGROUND_GROUPS,
  resolveChatBackground,
  type ChatBackgroundPreset,
} from '@/features/workplace/chatBackgrounds';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/utils/cn';

import '@/features/workplace/workplace-sunrise.css';

/**
 * Die Auswahl des Startseiten-Hintergrunds.
 *
 * Eigener Bereich statt einer Zeile in Allgemein, weil die Kacheln die
 * Einstellung selbst zeigen: Zehn 28px-Plättchen am rechten Rand einer Zeile
 * ließen sich nur an der Farbe unterscheiden — was ein Preset ausmacht, ist aber
 * die Verteilung über die Fläche (Nebel, Klarer Kern und Dunst teilen sich
 * dieselben vier Farben).
 *
 * Die Kacheln zeichnen deshalb die echten Klassen aus workplace-sunrise.css,
 * nicht die Ersatz-Verläufe des Plättchen-Pickers. Die Verläufe sind in Prozent
 * gestellt, skalieren also mit der Kachel, und der Dunkelmodus kommt über
 * dieselben `[data-theme='dark']`-Regeln mit.
 *
 * Gruppiert nach bunt/einfarbig (`CHAT_BACKGROUND_FAMILIES`), weil das die erste
 * Entscheidung ist: viel Farbe oder wenig. Innerhalb der Gruppe zählt dann der
 * Ton — bei den bunten die Menge an Schleier.
 */
const ENTRY = getSettingsEntry('hintergrund.startseite');

interface TileProps {
  preset: ChatBackgroundPreset;
  active: boolean;
  onSelect: (key: ChatBackground) => void;
}

const BackgroundTile = ({ preset, active, onSelect }: TileProps) => (
  <button
    type="button"
    role="radio"
    aria-checked={active}
    onClick={() => onSelect(preset.key)}
    className={cn(
      'flex flex-col gap-xs rounded-xl border p-1.5 text-left transition-colors',
      active
        ? 'border-primary-500 ring-2 ring-primary-500/25'
        : 'border-grey-200 hover:border-grey-400 dark:border-grey-700 dark:hover:border-grey-500'
    )}
  >
    {/* `bg-background`, damit „Neutral" — das Verlauf und Grundfarbe bewusst
        abschaltet — die Seitenfläche zeigt statt eines Lochs. */}
    <span
      className={cn(
        'workplace-chat-sunrise workplace-chat-preview relative flex aspect-[16/10] items-end justify-center overflow-hidden rounded-lg bg-background',
        preset.className
      )}
    >
      {/* Angedeuteter Composer: die zweite Hälfte der Einstellung ist die
          Akzentfarbe des Senden-Buttons, und die steht nur auf dieser Fläche.
          `workplace-chat-accent` biegt dafür dieselben Token um wie im echten
          Chat-Start. */}
      <span className="workplace-chat-accent mb-2.5 flex w-4/5 items-center justify-end rounded-full border border-grey-900/10 bg-white/75 p-1 dark:border-white/15 dark:bg-grey-900/70">
        <span className="size-3 rounded-full bg-primary" />
      </span>
      {active && (
        <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary-500 text-white">
          <Check className="size-3.5" />
        </span>
      )}
    </span>

    <span className="px-1 pb-0.5">
      <span className="block text-sm font-medium text-foreground">{preset.label}</span>
      <span className="mt-0.5 block text-xs text-grey-500 dark:text-grey-400">
        {preset.description}
      </span>
    </span>
  </button>
);

const BackgroundTab = () => {
  const chatBackground = useAuthStore((s) => s.user?.chat_background);
  const updateChatBackground = useAuthStore((s) => s.updateChatBackground);
  const selected = resolveChatBackground(chatBackground);

  return (
    <div className="flex flex-col gap-lg">
      <p className="m-0 max-w-prose text-sm text-grey-500 dark:text-grey-400">
        {ENTRY.description} Die Auswahl gilt sofort und auf allen Geräten, an denen du angemeldet
        bist.
      </p>

      {/* Eine Auswahl, nicht zwei: die Überschriften gliedern die Kacheln, aber
          die Radiogruppe umschließt alle — sonst läse sich „1 von 4" und „1 von
          6" wie zwei getrennte Entscheidungen. */}
      <div role="radiogroup" aria-label={ENTRY.title} className="flex flex-col gap-lg">
        {CHAT_BACKGROUND_GROUPS.map(({ family, label, description, presets }) => (
          <section key={family} className="flex flex-col gap-sm">
            <div>
              <h3 className="m-0 text-sm font-semibold text-foreground-heading">{label}</h3>
              <p className="m-0 mt-0.5 text-xs text-grey-500 dark:text-grey-400">{description}</p>
            </div>
            <div className="grid grid-cols-2 gap-md sm:grid-cols-3">
              {presets.map((preset) => (
                <BackgroundTile
                  key={preset.key}
                  preset={preset}
                  active={selected.key === preset.key}
                  onSelect={(key) => void updateChatBackground(key)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default BackgroundTab;
