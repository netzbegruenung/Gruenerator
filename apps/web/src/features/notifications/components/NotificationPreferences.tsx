import { SelectCard, Switch } from '@gruenerator/ui';
import { Bell, Mail, Settings2, Smartphone } from 'lucide-react';
import React from 'react';

import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { LEVEL_OPTIONS, RAW_TYPE_META, getRawTypesByGroup } from '../notificationPreferenceMeta';
import { CHANNEL_ORDER } from '../types/preferences';

import type { NotificationChannel } from '../types/preferences';
import type { NotificationType } from '@gruenerator/contracts';

import { cn } from '@/utils/cn';

interface NotificationPreferencesProps {
  onSuccessMessage: (message: string) => void;
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
  onSuccessMessage,
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
      const label = LEVEL_OPTIONS.find((o) => o.value === value)?.label ?? value;
      onSuccessMessage(`Benachrichtigungen auf „${label}" gesetzt.`);
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
      onSuccessMessage(
        `${RAW_TYPE_META[type].label} ${CHANNEL_LABELS[channel]} ${value ? 'aktiviert' : 'deaktiviert'}.`
      );
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
    <div className="space-y-lg">
      <div className="flex items-start justify-between gap-md">
        <div>
          <div className="text-sm font-medium text-foreground mb-xs">Benachrichtigungen</div>
          <p className="text-xs text-grey-500 dark:text-grey-400">
            {expertMode
              ? 'Stelle einzelne Benachrichtigungen pro Kanal ein.'
              : 'Wähle, wie viele Benachrichtigungen du erhalten möchtest.'}
          </p>
        </div>
        <label className="flex items-center gap-xs shrink-0 cursor-pointer select-none">
          <span className="flex items-center gap-xs text-xs text-grey-500 dark:text-grey-400">
            <Settings2 className="w-3.5 h-3.5" />
            Experten
          </span>
          <Switch
            className="h-[20px] w-[40px] data-[state=checked]:bg-secondary-600 data-[state=unchecked]:bg-grey-200 dark:data-[state=unchecked]:bg-grey-700"
            checked={expertMode}
            onCheckedChange={setExpertMode}
            aria-label="Experteneinstellungen"
          />
        </label>
      </div>

      {!expertMode ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
          {LEVEL_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <SelectCard
                key={opt.value}
                label={opt.label}
                description={opt.description}
                icon={<Icon className="w-5 h-5" />}
                selected={level === opt.value}
                onClick={() => {
                  if (!isApplyingLevel) void handleSelectLevel(opt.value);
                }}
              />
            );
          })}
        </div>
      ) : (
        <div className="space-y-lg">
          {RAW_GROUPS.map(({ group, label, types }) => (
            <div
              key={group}
              className="rounded-lg border border-grey-200 dark:border-grey-700 overflow-hidden"
            >
              <div className="px-md py-sm bg-grey-50 dark:bg-grey-800/50 border-b border-grey-200 dark:border-grey-700">
                <div className="flex items-center">
                  <h4 className="text-sm font-semibold text-foreground grow">{label}</h4>
                  <div className="flex items-center gap-lg pr-xs">
                    {CHANNEL_ORDER.map((ch) => {
                      const Icon = CHANNEL_ICONS[ch];
                      return (
                        <div
                          key={ch}
                          className="flex items-center gap-xs w-14 justify-center"
                          title={CHANNEL_LABELS[ch]}
                        >
                          <Icon className="w-3.5 h-3.5 text-grey-400 dark:text-grey-500" />
                          <span className="text-xs text-grey-500 dark:text-grey-400 hidden sm:inline">
                            {CHANNEL_LABELS[ch]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="divide-y divide-grey-100 dark:divide-grey-800">
                {types.map((type) => {
                  const meta = RAW_TYPE_META[type];
                  const channelState = preferences[type];
                  const Icon = meta.icon;

                  return (
                    <div
                      key={type}
                      className="flex items-center px-md py-sm hover:bg-grey-50 dark:hover:bg-grey-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-sm grow min-w-0">
                        <Icon className={cn('w-4 h-4 shrink-0 text-grey-400 dark:text-grey-500')} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{meta.label}</p>
                          <p className="text-xs text-grey-500 dark:text-grey-400 truncate">
                            {meta.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-lg pr-xs shrink-0">
                        {CHANNEL_ORDER.map((ch) => (
                          <div key={ch} className="w-14 flex justify-center">
                            <Switch
                              className="h-[20px] w-[40px] data-[state=checked]:bg-secondary-600 data-[state=unchecked]:bg-grey-200 dark:data-[state=unchecked]:bg-grey-700"
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
              </div>
            </div>
          ))}
          {expertExtras}
        </div>
      )}
    </div>
  );
};

export default NotificationPreferences;
