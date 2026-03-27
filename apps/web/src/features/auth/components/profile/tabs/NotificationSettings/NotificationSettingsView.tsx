import { Switch } from '@gruenerator/ui';
import { Bell, Mail, Smartphone, Info } from 'lucide-react';
import React from 'react';

import { useNotificationPreferences } from '../../../../../../features/notifications/hooks/useNotificationPreferences';
import { getPreferenceTypesByGroup } from '../../../../../../features/notifications/notificationConfig';
import { NOTIFICATION_GROUPS } from '../../../../../../features/notifications/types';
import { CHANNEL_ORDER } from '../../../../../../features/notifications/types/preferences';

import type { NotificationGroup } from '../../../../../../features/notifications/types';

import { cn } from '@/utils/cn';

interface NotificationSettingsViewProps {
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
}

const CHANNEL_ICONS = {
  in_app: Bell,
  email: Mail,
  push: Smartphone,
} as const;

const CHANNEL_LABELS = {
  in_app: 'In-App',
  email: 'E-Mail',
  push: 'Push',
} as const;

const NotificationSettingsView = React.memo(
  ({ onSuccessMessage, onErrorMessage }: NotificationSettingsViewProps) => {
    const { preferences, isLoading, toggleChannel } = useNotificationPreferences();
    const groupedTypes = getPreferenceTypesByGroup();

    const handleToggle = async (
      category: string,
      channel: 'email' | 'push' | 'in_app',
      label: string,
      value: boolean
    ) => {
      try {
        await toggleChannel(category, channel, value);
        onSuccessMessage(
          `${label} ${CHANNEL_LABELS[channel]} ${value ? 'aktiviert' : 'deaktiviert'}.`
        );
      } catch {
        onErrorMessage('Einstellung konnte nicht gespeichert werden.');
      }
    };

    if (isLoading) {
      return (
        <div className="animate-pulse space-y-lg py-md">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-lg bg-grey-100 dark:bg-grey-800" />
          ))}
        </div>
      );
    }

    const sortedGroups = [...groupedTypes.entries()].sort(
      ([a], [b]) =>
        (NOTIFICATION_GROUPS[a as NotificationGroup]?.order ?? 99) -
        (NOTIFICATION_GROUPS[b as NotificationGroup]?.order ?? 99)
    );

    return (
      <div className="animate-in fade-in duration-300 space-y-xl">
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-xs">Benachrichtigungen</h2>
          <p className="text-sm text-grey-500 dark:text-grey-400">
            Wähle aus, über welche Kanäle du benachrichtigt werden möchtest.
          </p>
        </div>

        <div className="flex items-start gap-sm p-md rounded-lg bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800">
          <Info className="w-4 h-4 mt-0.5 text-primary-600 dark:text-primary-400 shrink-0" />
          <p className="text-sm text-primary-700 dark:text-primary-300">
            Push-Benachrichtigungen erfordern die mobile App. In-App-Benachrichtigungen erscheinen
            in der Benachrichtigungsglocke oben rechts.
          </p>
        </div>

        {sortedGroups.map(([groupKey, types]) => {
          const groupMeta = NOTIFICATION_GROUPS[groupKey as NotificationGroup];
          if (!groupMeta) return null;

          return (
            <div
              key={groupKey}
              className="rounded-lg border border-grey-200 dark:border-grey-700 overflow-hidden"
            >
              <div className="px-md py-sm bg-grey-50 dark:bg-grey-800/50 border-b border-grey-200 dark:border-grey-700">
                <div className="flex items-center">
                  <h3 className="text-sm font-semibold text-foreground grow">{groupMeta.label}</h3>
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
                  const channelState = preferences[type.key];
                  const Icon = type.icon;

                  return (
                    <div
                      key={type.key}
                      className="flex items-center px-md py-sm hover:bg-grey-50 dark:hover:bg-grey-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-sm grow min-w-0">
                        <Icon className={cn('w-4 h-4 shrink-0 text-grey-400 dark:text-grey-500')} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {type.label}
                          </p>
                          <p className="text-xs text-grey-500 dark:text-grey-400 truncate">
                            {type.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-lg pr-xs shrink-0">
                        {CHANNEL_ORDER.map((ch) => (
                          <div key={ch} className="w-14 flex justify-center">
                            <Switch
                              className="h-[20px] w-[40px] data-[state=checked]:bg-secondary-600 data-[state=unchecked]:bg-grey-200 dark:data-[state=unchecked]:bg-grey-700"
                              checked={channelState?.[ch] ?? true}
                              onCheckedChange={(checked: boolean) =>
                                handleToggle(type.key, ch, type.label, checked)
                              }
                              aria-label={`${type.label} ${CHANNEL_LABELS[ch]}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);

NotificationSettingsView.displayName = 'NotificationSettingsView';

export default NotificationSettingsView;
