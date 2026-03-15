import { Badge } from '@gruenerator/ui';
import React from 'react';
import { type IconType } from 'react-icons';
import { HiOutlineDatabase, HiOutlineUsers, HiSave, HiOutlineDocumentSearch } from 'react-icons/hi';

import FeatureToggle from '../../../../../../components/common/FeatureToggle';
import { useBetaFeatures } from '../../../../../../hooks/useBetaFeatures';
import { useAuthStore, type SupportedLocale } from '../../../../../../stores/authStore';

interface SettingsSectionProps {
  isActive: boolean;
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
  igelActive: boolean;
  onToggleIgelModus: (checked: boolean) => void;
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
  WORKPLACE: 'workplace',
  VORLAGEN: 'vorlagen',
  AUTO_SAVE_GENERATED: 'autoSaveGenerated',
  AUTO_DOCUMENT_SEARCH: 'autoDocumentSearch',
};

const SettingsSection: React.FC<SettingsSectionProps> = ({
  isActive,
  onSuccessMessage,
  onErrorMessage,
  igelActive,
  onToggleIgelModus,
  isBetaFeaturesUpdating,
}) => {
  const { getBetaFeatureState, updateUserBetaFeatures, getAvailableFeatures, isAdmin } =
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
          linkTo: '/datenbank',
          linkText: 'Zur Datenbank',
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
      case BETA_VIEWS.WORKPLACE:
        return {
          title: 'Desk',
          description: 'Gruppen, Dokumente, Scanner und Boards',
          checked: getBetaFeatureState('workplace'),
          setter: (value: boolean) => updateUserBetaFeatures('workplace', value),
          featureName: 'Desk',
          checkboxLabel: 'Gruppen, Dokumente, Scanner (OCR) und Kanban-Boards aktivieren',
          linkTo: '/desk',
          linkText: 'Zum Desk',
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
      case BETA_VIEWS.AUTO_SAVE_GENERATED:
        return {
          title: 'Auto-Speichern generierter Texte',
          description: 'Generierte Texte automatisch in der Bibliothek speichern',
          checked: getBetaFeatureState('autoSaveGenerated'),
          setter: (value: boolean) => updateUserBetaFeatures('autoSaveGenerated', value),
          featureName: 'Auto-Speichern generierter Texte',
          checkboxLabel: 'Automatisches Speichern generierter Texte in der Bibliothek aktivieren',
          icon: HiSave,
        };
      case BETA_VIEWS.AUTO_DOCUMENT_SEARCH:
        return {
          title: 'Automatische Dokumentensuche',
          description: 'KI durchsucht deine Bibliothek automatisch',
          checked: getBetaFeatureState('autoDocumentSearch'),
          setter: (value: boolean) => updateUserBetaFeatures('autoDocumentSearch', value),
          featureName: 'Automatische Dokumentensuche',
          checkboxLabel:
            'Automatische Suche in deiner Dokumenten-Bibliothek bei der Textgenerierung aktivieren',
          icon: HiOutlineDocumentSearch,
        };
      default:
        return null;
    }
  };

  const SETTINGS_KEYS = new Set(['autoSaveGenerated', 'autoDocumentSearch']);
  const allFeatures = getAvailableFeatures();
  const settingsFeatures = allFeatures.filter((f) => SETTINGS_KEYS.has(f.key));
  const experimentalFeatures = allFeatures.filter((f) => !SETTINGS_KEYS.has(f.key));

  const renderToggle = (feature: { key: string; isAdminOnly: boolean }, isExperimental = false) => {
    const config = getBetaFeatureConfig(feature.key);
    if (!config) return null;
    const description = isExperimental
      ? `${config.description} (Experimentell)`
      : config.description;
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
    <div>
      <div className="text-sm font-medium text-foreground mb-md">Einstellungen</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        {settingsFeatures.map((f) => renderToggle(f))}
        {experimentalFeatures.map((f) => renderToggle(f, true))}
      </div>
    </div>
  );
};

export default SettingsSection;
export { LocaleSelector };
