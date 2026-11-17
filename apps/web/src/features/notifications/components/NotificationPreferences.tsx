import { type NotificationLevel, type NotificationType } from '@gruenerator/contracts';
import { Switch } from '@gruenerator/ui';
import { Bell, Mail, Smartphone } from 'lucide-react';
import React from 'react';

import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { LEVEL_OPTIONS, RAW_TYPE_META, getRawTypesByGroup } from '../notificationPreferenceMeta';
import { CHANNEL_ORDER } from '../types/preferences';

import type { NotificationChannel } from '../types/preferences';

import SegmentedControl from '@/features/settings/components/SegmentedControl';
import SettingsRow from '@/features/settings/components/SettingsRow';
import SettingsSection from '@/features/settings/components/SettingsSection';

interface NotificationPreferencesProps {
  // Saving is silent: only a failure is reported.
  onErrorMessage: (message: string) => void;
  /** Nur im Experten-Modus angezeigt (z. B. Test-E-Mail). */
  expertExtras?: React.ReactNode;
}

const CHANNEL_ICONS: Record<NotificationChannel, React.ComponentType<{ className?: string }>> = {
  in_app: Bell,
  email: Mail,
  push: Smartphone,
};

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: 'In-App',
  email: 'E-Mail',
  push: 'Push',
};

const RAW_GROUPS = getRawTypesByGroup();

const NotificationPreferences: React.FC<NotificationPreferencesProps> = ({
  onErrorMessage,
  expertExtras,
}) => {
  const { level, preferences, isLoading, applyLevel, isApplyingLevel, toggleChannel } =
    useNotificationPreferences();

  // Experten-Modus: ersetzt die Stufenauswahl durch die erweiterten Einstellungen
  // (nie beides gleichzeitig). Standardmäßig an, wenn bereits individuell konfiguriert.
  const [expertMode, setExpertMode] = React.useState(level === 'custom');

  const handleSelectLevel = async (value: 'low' | 'medium' | 'high') => {
    if (level === value) return;
    try {
      await applyLevel(value);
    } catch {
      onErrorMessage('Einstellung konnte nicht gespeichert werden.');
    }
  };

  const handleToggleChannel = async (
    type: NotificationType,
    channel: NotificationChannel,
    value: boolean
  ) => {
    try {
      await toggleChannel(type, channel, value);
    } catch {
      onErrorMessage('Einstellung konnte nicht gespeichert werden.');
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-md">
        <div className="h-5 w-40 rounded bg-grey-100 dark:bg-grey-800" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-grey-100 dark:bg-grey-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {!expertMode && (
        <SettingsSection title="Benachrichtigungen">
          <SettingsRow id="benachrichtigungen.stufe">
            <SegmentedControl<NotificationLevel>
              aria-label="Wie viel wir melden"
              value={level}
              onChange={(value) => {
                if (!isApplyingLevel && value !== 'custom') void handleSelectLevel(value);
              }}
              options={LEVEL_OPTIONS.map(({ value, label }) => ({ value, label }))}
            />
          </SettingsRow>
        </SettingsSection>
      )}

      <SettingsSection title="Feinsteuerung">
        <div className="flex min-h-14 items-center justify-between gap-6 py-3.5">
          <label htmlFor="notification-expert" className="min-w-0 cursor-pointer">
            <span className="m-0 block text-sm font-medium text-foreground">Experten</span>
            <span className="m-0 mt-0.5 block text-xs text-grey-500 dark:text-grey-400">
              {expertMode
                ? 'Stelle einzelne Benachrichtigungen pro Kanal ein.'
                : 'Wähle, wie viele Benachrichtigungen du erhalten möchtest.'}
            </span>
          </label>
          <Switch
            id="notification-expert"
            checked={expertMode}
            onCheckedChange={setExpertMode}
            aria-label="Experteneinstellungen"
          />
        </div>
      </SettingsSection>

      {expertMode && (
        <>
          {RAW_GROUPS.map(({ group, label, types }) => (
            <SettingsSection
              key={group}
              title={label}
              aside={
                <div className="flex items-center gap-md">
                  {CHANNEL_ORDER.map((ch) => {
                    const Icon = CHANNEL_ICONS[ch];
                    return (
                      <div
                        key={ch}
                        className="flex w-12 items-center justify-center gap-xs sm:w-14"
                        title={CHANNEL_LABELS[ch]}
                      >
                        <Icon className="h-3.5 w-3.5 text-grey-400 dark:text-grey-500" />
                        <span className="hidden whitespace-nowrap text-xs text-grey-500 sm:inline dark:text-grey-400">
                          {CHANNEL_LABELS[ch]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              }
            >
              {types.map((type) => {
                const meta = RAW_TYPE_META[type];
                const channelState = preferences[type];
                const Icon = meta.icon;

                return (
                  <div key={type} className="flex items-center justify-between gap-md py-3">
                    <div className="flex min-w-0 grow items-center gap-sm">
                      <Icon className="h-4 w-4 shrink-0 text-grey-400 dark:text-grey-500" />
                      <div className="min-w-0">
                        <p className="m-0 text-sm font-medium text-foreground">{meta.label}</p>
                        <p className="m-0 text-xs text-grey-500 dark:text-grey-400">
                          {meta.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-md">
                      {CHANNEL_ORDER.map((ch) => (
                        <div key={ch} className="flex w-12 justify-center sm:w-14">
                          <Switch
                            checked={channelState?.[ch] ?? false}
                            onCheckedChange={(checked: boolean) =>
                              handleToggleChannel(type, ch, checked)
                            }
                            aria-label={`${meta.label} ${CHANNEL_LABELS[ch]}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </SettingsSection>
          ))}
          {expertExtras && <SettingsSection title="E-Mail">{expertExtras}</SettingsSection>}
        </>
      )}
    </div>
  );
};

export default NotificationPreferences;
