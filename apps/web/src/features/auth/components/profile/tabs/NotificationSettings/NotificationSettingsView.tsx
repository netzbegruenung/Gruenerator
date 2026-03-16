import React from 'react';
import {
  HiOutlineMail,
  HiOutlinePencilAlt,
  HiOutlineClipboardList,
  HiOutlineUserGroup,
} from 'react-icons/hi';

import FeatureToggle from '../../../../../../components/common/FeatureToggle';
import { useUserDefaults } from '../../../../../../hooks/useUserDefaults';

import type { ComponentType } from 'react';

interface NotificationSettingsViewProps {
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
}

interface NotificationConfig {
  key: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

const NOTIFICATION_CATEGORIES: NotificationConfig[] = [
  {
    key: 'document_shared',
    label: 'Geteilte Dokumente',
    description: 'E-Mail erhalten, wenn jemand ein Dokument mit dir teilt',
    icon: HiOutlineMail,
  },
  {
    key: 'document_edited',
    label: 'Dokumentbearbeitungen',
    description: 'E-Mail erhalten, wenn ein geteiltes Dokument bearbeitet wird',
    icon: HiOutlinePencilAlt,
  },
  {
    key: 'board_updates',
    label: 'Board-Aufgaben',
    description: 'E-Mail erhalten bei Aufgaben-Zuweisungen und -Updates',
    icon: HiOutlineClipboardList,
  },
  {
    key: 'group_activity',
    label: 'Gruppenaktivität',
    description: 'E-Mail erhalten über Ereignisse in deinen Gruppen',
    icon: HiOutlineUserGroup,
  },
];

const NotificationSettingsView = React.memo(
  ({ onSuccessMessage, onErrorMessage }: NotificationSettingsViewProps) => {
    const { get, set } = useUserDefaults<boolean>('notifications');

    const handleToggle = async (key: string, label: string, checked: boolean) => {
      try {
        await set(key, checked);
        onSuccessMessage(`${label} ${checked ? 'aktiviert' : 'deaktiviert'}.`);
      } catch {
        onErrorMessage('Einstellung konnte nicht gespeichert werden.');
      }
    };

    return (
      <div className="animate-in fade-in duration-300">
        <div className="mb-lg">
          <h2 className="text-lg font-semibold text-foreground mb-xs">
            E-Mail-Benachrichtigungen
          </h2>
          <p className="text-sm text-grey-500 dark:text-grey-400">
            Wähle aus, welche E-Mail-Benachrichtigungen du erhalten möchtest.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
          {NOTIFICATION_CATEGORIES.map((category) => (
            <FeatureToggle
              key={category.key}
              isActive={get(category.key, true)}
              onToggle={(checked) => handleToggle(category.key, category.label, checked)}
              label={category.label}
              icon={category.icon}
              description={category.description}
            />
          ))}
        </div>
      </div>
    );
  }
);

NotificationSettingsView.displayName = 'NotificationSettingsView';

export default NotificationSettingsView;
