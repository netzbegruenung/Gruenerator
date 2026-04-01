import { Badge } from '@gruenerator/ui';
import React, { memo } from 'react';
import { type IconType } from 'react-icons';
import { HiOutlineDatabase, HiOutlineUsers } from 'react-icons/hi';

import FeatureToggle from '../../../../../../components/common/FeatureToggle';
import { getEmailPreferenceTypes } from '../../../../../../features/notifications/notificationConfig';
import { useBetaFeatures } from '../../../../../../hooks/useBetaFeatures';
import { useUserDefaults } from '../../../../../../hooks/useUserDefaults';
import { useAuthStore, type SupportedLocale } from '../../../../../../stores/authStore';

interface SettingsSectionProps {
  isActive: boolean;
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
  isBetaFeaturesUpdating: boolean;
}

interface BetaFeatureUIConfig {
  title: string;
  description: string;
  checked: boolean;
  setter: (value: boolean) => Promise<void>;
  featureName: string;
  checkboxLabel: string;
  linkTo?: string;
  linkText?: string;
  icon: IconType | React.ComponentType;
}

type BetaViewKey = (typeof BETA_VIEWS)[keyof typeof BETA_VIEWS];

const LocaleSelector: React.FC = () => {
  const { locale, updateLocale } = useAuthStore();

  const handleLocaleChange = async (event: React.ChangeEvent<HTMLSelectElement>): Promise<void> => {
    const newLocale = event.target.value as SupportedLocale;
    const success = await updateLocale(newLocale);
    if (!success) {
      console.error('Failed to update locale');
    }
  };

  return (
    <div className="flex flex-col gap-xxs">
      <select
        id="locale"
        value={locale}
        onChange={handleLocaleChange}
        className="rounded-md border border-grey-300 dark:border-grey-600 bg-background px-sm py-xs text-sm"
        aria-label="Sprachvariant auswählen"
      >
        <option value="de-DE">Deutsch (Deutschland)</option>
        <option value="de-AT">Deutsch (Österreich)</option>
      </select>
    </div>
  );
};

const BETA_VIEWS = {
  DATABASE: 'database',
  COLLAB: 'collab',
  VORLAGEN: 'vorlagen',
};

const SettingsSection: React.FC<SettingsSectionProps> = memo(
  ({ isActive, onSuccessMessage, onErrorMessage, isBetaFeaturesUpdating }) => {
    const { getBetaFeatureState, updateUserBetaFeatures, availableFeatures, isAdmin } =
      useBetaFeatures();

    const getBetaFeatureConfig = (viewKey: BetaViewKey): BetaFeatureUIConfig | null => {
      switch (viewKey) {
        case BETA_VIEWS.DATABASE:
          return {
            title: 'Texte & Vorlagen',
            description: 'Datenbank für Texte und Vorlagen',
            checked: getBetaFeatureState('database'),
            setter: (value: boolean) => updateUserBetaFeatures('database', value),
            featureName: 'Datenbank',
            checkboxLabel:
              "'Texte & Vorlagen'-Tab (Datenbank) anzeigen und Funktionalität aktivieren",
            linkTo: '/datenbank/agents',
            linkText: 'Zu Agenten & Skills',
            icon: HiOutlineDatabase,
          };
        case BETA_VIEWS.COLLAB:
          return {
            title: 'Kollaborative Bearbeitung',
            description: 'Echtzeit-Zusammenarbeit an Dokumenten',
            checked: getBetaFeatureState('collab'),
            setter: (value: boolean) => updateUserBetaFeatures('collab', value),
            featureName: 'Kollaborative Bearbeitung',
            checkboxLabel: 'Kollaborative Bearbeitung aktivieren',
            icon: HiOutlineUsers,
          };
        case BETA_VIEWS.VORLAGEN:
          return {
            title: 'Vorlagen & Galerie',
            description: 'Persönliche und öffentliche Vorlagen',
            checked: getBetaFeatureState('vorlagen'),
            setter: (value: boolean) => updateUserBetaFeatures('vorlagen', value),
            featureName: 'Vorlagen & Galerie',
            checkboxLabel: 'Meine Vorlagen und Vorlagen-Galerie aktivieren',
            linkTo: '/profile/inhalte/vorlagen',
            linkText: 'Zu Meine Vorlagen',
            icon: HiOutlineDatabase,
          };
        default:
          return null;
      }
    };

    const renderToggle = (feature: { key: string; isAdminOnly: boolean }) => {
      const config = getBetaFeatureConfig(feature.key);
      if (!config) return null;
      const description = `${config.description} (Experimentell)`;
      return (
        <div key={feature.key} className="flex items-center gap-sm">
          <FeatureToggle
            isActive={config.checked}
            onToggle={(checked) => {
              config.setter(checked);
              onSuccessMessage(`${config.featureName} ${checked ? 'aktiviert' : 'deaktiviert'}.`);
            }}
            label={config.title}
            icon={config.icon}
            description={description}
            className="flex-1"
          />
          {feature.isAdminOnly && <Badge variant="secondary">Admin</Badge>}
        </div>
      );
    };

    return (
      <div className="flex flex-col gap-lg">
        {availableFeatures.length > 0 && (
          <div>
            <div className="text-sm font-medium text-foreground mb-md">Einstellungen</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
              {availableFeatures.map((f) => renderToggle(f))}
            </div>
          </div>
        )}

        <NotificationToggles onSuccessMessage={onSuccessMessage} onErrorMessage={onErrorMessage} />
      </div>
    );
  }
);

const NotificationToggles: React.FC<{
  onSuccessMessage: (msg: string) => void;
  onErrorMessage: (msg: string) => void;
}> = memo(({ onSuccessMessage, onErrorMessage }) => {
  const { get, set } = useUserDefaults<boolean>('notifications');
  const categories = getEmailPreferenceTypes();

  const handleToggle = async (key: string, label: string, checked: boolean) => {
    try {
      await set(key, checked);
      onSuccessMessage(`${label} ${checked ? 'aktiviert' : 'deaktiviert'}.`);
    } catch {
      onErrorMessage('Einstellung konnte nicht gespeichert werden.');
    }
  };

  return (
    <div>
      <div className="text-sm font-medium text-foreground mb-md">E-Mail-Benachrichtigungen</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        {categories.map((cat) => (
          <FeatureToggle
            key={cat.key}
            isActive={get(cat.key, true)}
            onToggle={(checked) => handleToggle(cat.key, cat.label, checked)}
            label={cat.label}
            icon={cat.icon}
            description={cat.description}
          />
        ))}
      </div>
    </div>
  );
});

export default SettingsSection;
export { LocaleSelector };
