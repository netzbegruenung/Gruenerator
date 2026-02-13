import React from 'react';
import { type IconType } from 'react-icons';
import { GiHedgehog } from 'react-icons/gi';
import {
  HiOutlineExternalLink,
  HiOutlineDatabase,
  HiOutlineUsers,
  HiSave,
  HiOutlineChat,
  HiOutlineDocumentSearch,
} from 'react-icons/hi';
import { Link } from 'react-router-dom';

import FeatureToggle from '../../../../../../components/common/FeatureToggle';
import { getIcon } from '../../../../../../config/icons';
import { useBetaFeatures } from '../../../../../../hooks/useBetaFeatures';
import { useAuthStore, type SupportedLocale } from '../../../../../../stores/authStore';

interface SettingsSectionProps {
  isActive: boolean;
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
  igelActive: boolean;
  onToggleIgelModus: (checked: boolean) => void;
  isBetaFeaturesUpdating: boolean;
  compact?: boolean;
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
    <div className="form-field-wrapper">
      <select
        id="locale"
        value={locale}
        onChange={handleLocaleChange}
        className="form-select"
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
  AUTO_SAVE_EXPORT: 'autoSaveOnExport',
  GROUPS: 'groups',
  WEBSITE: 'website',
  VORLAGEN: 'vorlagen',
  SCANNER: 'scanner',
  DOCS: 'docs',
};

const SettingsSection: React.FC<SettingsSectionProps> = ({
  isActive,
  onSuccessMessage,
  onErrorMessage,
  igelActive,
  onToggleIgelModus,
  isBetaFeaturesUpdating,
  compact = false,
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
      case BETA_VIEWS.AUTO_SAVE_EXPORT:
        return {
          title: 'Auto-Speichern',
          description: 'Exporte automatisch in Bibliothek speichern',
          checked: getBetaFeatureState('autoSaveOnExport'),
          setter: (value: boolean) => updateUserBetaFeatures('autoSaveOnExport', value),
          featureName: 'Auto-Speichern bei Export',
          checkboxLabel: 'Automatisches Speichern bei jedem Export aktivieren',
          icon: HiSave,
        };
      // DEPRECATED: Grünerator Chat case
      // case BETA_VIEWS.CHAT:
      //   return {
      //     title: 'Grünerator Chat',
      //     description: 'KI-Chat für Fragen und Antworten',
      //     checked: getBetaFeatureState('chat'),
      //     setter: (value: boolean) => updateUserBetaFeatures('chat', value),
      //     featureName: 'Grünerator Chat',
      //     checkboxLabel: 'Grünerator Chat aktivieren',
      //     linkTo: '/chat',
      //     linkText: 'Zum Chat',
      //     icon: HiOutlineChat,
      //   };
      case BETA_VIEWS.GROUPS:
        return {
          title: 'Gruppen',
          description: 'Team-Zusammenarbeit und Inhalte teilen',
          checked: getBetaFeatureState('groups'),
          setter: (value: boolean) => updateUserBetaFeatures('groups', value),
          featureName: 'Gruppen',
          checkboxLabel: 'Gruppen-Tab im Profil anzeigen und Funktionalität aktivieren',
          linkTo: '/profile/groups',
          linkText: 'Zu den Gruppen',
          icon: HiOutlineUsers,
        };
      case BETA_VIEWS.WEBSITE:
        return {
          title: 'Website Generator',
          description: 'WordPress Landing Pages generieren',
          checked: getBetaFeatureState('website'),
          setter: (value: boolean) => updateUserBetaFeatures('website', value),
          featureName: 'Website Generator',
          checkboxLabel: 'Website Generator aktivieren',
          linkTo: '/website',
          linkText: 'Zum Website Generator',
          icon: getIcon('navigation', 'website') as IconType,
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
      case BETA_VIEWS.SCANNER:
        return {
          title: 'Scanner (OCR)',
          description: 'Text aus Dokumenten extrahieren',
          checked: getBetaFeatureState('scanner'),
          setter: (value: boolean) => updateUserBetaFeatures('scanner', value),
          featureName: 'Scanner',
          checkboxLabel: 'Scanner für Dokumenten-Texterkennung aktivieren',
          linkTo: '/scanner',
          linkText: 'Zum Scanner',
          icon: getIcon('navigation', 'scanner') as IconType,
        };
      case BETA_VIEWS.DOCS:
        return {
          title: 'Dokumente',
          description: 'Kollaborativer Dokumenten-Editor mit Echtzeit-Zusammenarbeit',
          checked: getBetaFeatureState('docs'),
          setter: (value: boolean) => updateUserBetaFeatures('docs', value),
          featureName: 'Dokumente',
          checkboxLabel: 'Kollaborativen Dokumenten-Editor aktivieren',
          linkTo: '/docs',
          linkText: 'Zu den Dokumenten',
          icon: HiOutlineDocumentSearch,
        };
      default:
        return null;
    }
  };

  return (
    <div className={`settings-section-container ${compact ? 'settings-section-compact' : ''}`}>
      <div className="settings-section-title">Experimentelle Features</div>
      <div className={`settings-features-grid ${compact ? 'settings-features-compact' : ''}`}>
        {getAvailableFeatures().map((feature) => {
          const config = getBetaFeatureConfig(feature.key);
          if (!config) return null;

          return (
            <div key={feature.key} className="settings-feature-item">
              <FeatureToggle
                isActive={config.checked}
                onToggle={(checked) => {
                  config.setter(checked);
                  onSuccessMessage(
                    `${config.featureName} ${checked ? 'aktiviert' : 'deaktiviert'}.`
                  );
                }}
                label={compact ? config.title : config.checkboxLabel}
                icon={config.icon}
                description={config.description}
                className={`settings-feature-toggle ${compact ? 'settings-feature-toggle-compact' : ''}`}
              />
              {feature.isAdminOnly && <span className="admin-badge">Admin</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SettingsSection;
export { LocaleSelector };
