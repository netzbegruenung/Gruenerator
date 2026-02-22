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
import { Badge } from '../../../../../../components/ui/badge';
import { Card } from '../../../../../../components/ui/card';
import { getIcon } from '../../../../../../config/icons';
import { useBetaFeatures } from '../../../../../../hooks/useBetaFeatures';
import { useAuthStore, type SupportedLocale } from '../../../../../../stores/authStore';
import { cn } from '../../../../../../utils/cn';

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
  GROUPS: 'groups',
  VORLAGEN: 'vorlagen',
  SCANNER: 'scanner',
  DOCS: 'docs',
  CHAT: 'chat',
  AUTO_SAVE_GENERATED: 'autoSaveGenerated',
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
      case BETA_VIEWS.CHAT:
        return {
          title: 'Grünerator Chat',
          description: 'KI-Chat für Fragen und Antworten',
          checked: getBetaFeatureState('chat'),
          setter: (value: boolean) => updateUserBetaFeatures('chat', value),
          featureName: 'Grünerator Chat',
          checkboxLabel: 'Grünerator Chat aktivieren',
          linkTo: '/chat',
          linkText: 'Zum Chat',
          icon: HiOutlineChat,
        };
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
      // case BETA_VIEWS.DOCS:
      //   return {
      //     title: 'Dokumente',
      //     description: 'Kollaborativer Dokumenten-Editor mit Echtzeit-Zusammenarbeit',
      //     checked: getBetaFeatureState('docs'),
      //     setter: (value: boolean) => updateUserBetaFeatures('docs', value),
      //     featureName: 'Dokumente',
      //     checkboxLabel: 'Kollaborativen Dokumenten-Editor aktivieren',
      //     linkTo: '/docs',
      //     linkText: 'Zu den Dokumenten',
      //     icon: HiOutlineDocumentSearch,
      //   };
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
      default:
        return null;
    }
  };

  return (
    <Card className={cn('flex flex-col', compact ? 'p-md' : 'p-lg')}>
      <div className={cn('font-semibold mb-md', compact ? 'text-sm mb-sm' : 'text-base')}>
        Experimentelle Features
      </div>
      <div className={cn('grid gap-sm', compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
        {getAvailableFeatures().map((feature) => {
          const config = getBetaFeatureConfig(feature.key);
          if (!config) return null;

          return (
            <div key={feature.key} className="flex items-center gap-sm">
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
                className={cn('flex-1', compact && 'text-sm')}
              />
              {feature.isAdminOnly && <Badge variant="secondary">Admin</Badge>}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default SettingsSection;
export { LocaleSelector };
