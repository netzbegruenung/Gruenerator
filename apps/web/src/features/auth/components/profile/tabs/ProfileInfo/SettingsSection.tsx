import React from 'react';
import { Link } from 'react-router-dom';
import { GiHedgehog } from 'react-icons/gi';
import { IconType } from 'react-icons';
import { NotebookIcon, getIcon } from '../../../../../../config/icons';
import FeatureToggle from '../../../../../../components/common/FeatureToggle';
import { useBetaFeatures } from '../../../../../../hooks/useBetaFeatures';
import { useAuthStore, SupportedLocale } from '../../../../../../stores/authStore';
import {
    HiOutlineExternalLink,
    HiOutlineDatabase,
    HiOutlinePhotograph,
    HiOutlineUsers,
    HiSave,
    HiOutlineChat
} from 'react-icons/hi';

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

type BetaViewKey = typeof BETA_VIEWS[keyof typeof BETA_VIEWS];

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
    NOTEBOOK: 'notebook',
    CANVA: 'canva',
    AUTO_SAVE_EXPORT: 'autoSaveOnExport',
    CHAT: 'chat',
    GROUPS: 'groups',
    WEBSITE: 'website',
    VORLAGEN: 'vorlagen',
    VIDEO_EDITOR: 'videoEditor',
};

const SettingsSection: React.FC<SettingsSectionProps> = ({
    isActive,
    onSuccessMessage,
    onErrorMessage,
    igelActive,
    onToggleIgelModus,
    isBetaFeaturesUpdating
}) => {
    const {
        getBetaFeatureState,
        updateUserBetaFeatures,
        getAvailableFeatures,
        isAdmin
    } = useBetaFeatures();

    const getBetaFeatureConfig = (viewKey: BetaViewKey): BetaFeatureUIConfig | null => {
        switch (viewKey) {
            case BETA_VIEWS.DATABASE:
                return {
                    title: 'Texte & Vorlagen',
                    description: 'Zugang zur Datenbank mit Texten und Vorlagen für deine Arbeit.',
                    checked: getBetaFeatureState('database'),
                    setter: (value: boolean) => updateUserBetaFeatures('database', value),
                    featureName: 'Datenbank',
                    checkboxLabel: '\'Texte & Vorlagen\'-Tab (Datenbank) anzeigen und Funktionalität aktivieren',
                    linkTo: '/datenbank',
                    linkText: 'Zur Datenbank',
                    icon: HiOutlineDatabase
                };
            case BETA_VIEWS.COLLAB:
                return {
                    title: 'Kollaborative Bearbeitung',
                    description: 'Arbeite in Echtzeit mit anderen an Dokumenten und Texten.',
                    checked: getBetaFeatureState('collab'),
                    setter: (value: boolean) => updateUserBetaFeatures('collab', value),
                    featureName: 'Kollaborative Bearbeitung',
                    checkboxLabel: 'Kollaborative Bearbeitung aktivieren',
                    icon: HiOutlineUsers
                };
            case BETA_VIEWS.NOTEBOOK:
                return {
                    title: 'Notebooks',
                    description: 'Fragesysteme basierend auf deinen Dokumenten für natürliche Gespräche.',
                    checked: getBetaFeatureState('notebook'),
                    setter: (value: boolean) => updateUserBetaFeatures('notebook', value),
                    featureName: 'Notebooks',
                    checkboxLabel: 'Notebooks aktivieren',
                    icon: NotebookIcon
                };
            case BETA_VIEWS.CANVA:
                return {
                    title: 'Canva Integration',
                    description: 'Erweiterte Canva-Integration mit Zugriff auf deine Designs, Vorlagen und Assets. Synchronisiere deine Canva-Inhalte und nutze sie direkt in der Grünerator-Plattform.',
                    checked: getBetaFeatureState('canva'),
                    setter: (value: boolean) => updateUserBetaFeatures('canva', value),
                    featureName: 'Canva Integration',
                    checkboxLabel: 'Canva-Tab in Texte & Grafik anzeigen und Funktionalität aktivieren',
                    icon: HiOutlinePhotograph
                };
            case BETA_VIEWS.AUTO_SAVE_EXPORT:
                return {
                    title: 'Auto-Speichern bei Export',
                    description: 'Speichere jeden Export (PDF, DOCX, Etherpad, Wolke, Kopieren) automatisch in deiner Textbibliothek. Verhindert doppelte Speicherungen innerhalb der gleichen Sitzung.',
                    checked: getBetaFeatureState('autoSaveOnExport'),
                    setter: (value: boolean) => updateUserBetaFeatures('autoSaveOnExport', value),
                    featureName: 'Auto-Speichern bei Export',
                    checkboxLabel: 'Automatisches Speichern bei jedem Export aktivieren',
                    icon: HiSave
                };
            case BETA_VIEWS.CHAT:
                return {
                    title: 'Grünerator Chat',
                    description: 'Interaktiver Chat-Assistent für direkte Gespräche mit dem Grünerator. Stelle Fragen und erhalte KI-gestützte Antworten.',
                    checked: getBetaFeatureState('chat'),
                    setter: (value: boolean) => updateUserBetaFeatures('chat', value),
                    featureName: 'Grünerator Chat',
                    checkboxLabel: 'Grünerator Chat aktivieren',
                    linkTo: '/chat',
                    linkText: 'Zum Chat',
                    icon: HiOutlineChat
                };
            case BETA_VIEWS.GROUPS:
                return {
                    title: 'Gruppen',
                    description: 'Erstelle und verwalte Gruppen für gemeinsames Arbeiten. Teile Anweisungen, Wissen und Inhalte mit deinem Team oder Verband.',
                    checked: getBetaFeatureState('groups'),
                    setter: (value: boolean) => updateUserBetaFeatures('groups', value),
                    featureName: 'Gruppen',
                    checkboxLabel: 'Gruppen-Tab im Profil anzeigen und Funktionalität aktivieren',
                    linkTo: '/profile/groups',
                    linkText: 'Zu den Gruppen',
                    icon: HiOutlineUsers
                };
            case BETA_VIEWS.WEBSITE:
                return {
                    title: 'Website Generator',
                    description: 'Generiere JSON-Inhalte für WordPress Landing Pages. Ideal für Kandidat*innen, die eine professionelle politische Website erstellen möchten.',
                    checked: getBetaFeatureState('website'),
                    setter: (value: boolean) => updateUserBetaFeatures('website', value),
                    featureName: 'Website Generator',
                    checkboxLabel: 'Website Generator aktivieren',
                    linkTo: '/website',
                    linkText: 'Zum Website Generator',
                    icon: getIcon('navigation', 'website') as IconType
                };
            case BETA_VIEWS.VORLAGEN:
                return {
                    title: 'Vorlagen & Galerie',
                    description: 'Zugang zu deinen persönlichen Vorlagen und der öffentlichen Vorlagen-Galerie.',
                    checked: getBetaFeatureState('vorlagen'),
                    setter: (value: boolean) => updateUserBetaFeatures('vorlagen', value),
                    featureName: 'Vorlagen & Galerie',
                    checkboxLabel: 'Meine Vorlagen und Vorlagen-Galerie aktivieren',
                    linkTo: '/profile/inhalte/vorlagen',
                    linkText: 'Zu Meine Vorlagen',
                    icon: HiOutlineDatabase
                };
            case BETA_VIEWS.VIDEO_EDITOR:
                return {
                    title: 'Video Editor',
                    description: 'Volle Video-Bearbeitung im Reel-Studio: Video schneiden, Text-Overlays und Untertitel.',
                    checked: getBetaFeatureState('videoEditor'),
                    setter: (value: boolean) => updateUserBetaFeatures('videoEditor', value),
                    featureName: 'Video Editor',
                    checkboxLabel: 'Volle Video-Bearbeitung im Reel-Studio aktivieren',
                    linkTo: '/reel',
                    linkText: 'Zum Reel-Studio',
                    icon: getIcon('navigation', 'reel') as IconType
                };
            default:
                return null;
        }
    };

    return (
        <div
            role="tabpanel"
            id="einstellungen-panel"
            aria-labelledby="einstellungen-tab"
            tabIndex={-1}
        >
            <div className="auth-form">
                <div className="form-group">
                    <div className="form-group-title">Sprache & Mitgliedschaften</div>
                    <div className="settings-row">
                        <LocaleSelector />
                        <FeatureToggle
                            isActive={igelActive}
                            onToggle={onToggleIgelModus}
                            label="Igel-Modus (Grüne Jugend)"
                            icon={GiHedgehog}
                            className="igel-modus-toggle"
                            disabled={isBetaFeaturesUpdating}
                        />
                    </div>
                </div>

                <hr className="form-divider" />

                <div className="form-group">
                    <div className="form-group-title">Experimentelle Features</div>
                    <div className="profile-cards-grid">
                        {getAvailableFeatures().map(feature => {
                            const config = getBetaFeatureConfig(feature.key);
                            if (!config) return null;

                            return (
                                <div key={feature.key} className="profile-card">
                                    <div className="profile-card-header">
                                        <h3>{config.title}</h3>
                                        {feature.isAdminOnly && <span className="admin-badge">Admin</span>}
                                    </div>
                                    <div className="profile-card-content">
                                        <FeatureToggle
                                            isActive={config.checked}
                                            onToggle={(checked) => {
                                                config.setter(checked);
                                                onSuccessMessage(`${config.featureName} ${checked ? 'aktiviert' : 'deaktiviert'}.`);
                                            }}
                                            label={config.checkboxLabel}
                                            icon={config.icon}
                                            description={config.description}
                                            className="labor-feature-toggle"
                                            noBorder
                                        />

                                        {config.linkTo && config.checked && (
                                            <Link
                                                to={config.linkTo}
                                                className="profile-action-button profile-secondary-button labor-tab-external-link"
                                            >
                                                {config.linkText} <HiOutlineExternalLink className="labor-tab-external-link-icon" />
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {!isAdmin && getAvailableFeatures().some(f => f.isAdminOnly) && (
                        <div className="profile-card" style={{ marginTop: 'var(--spacing-large)' }}>
                            <div className="profile-card-header">
                                <h3>Administrator-Features</h3>
                            </div>
                            <div className="profile-card-content">
                                <p><strong>Hinweis:</strong> Einige Beta-Features sind nur für Administratoren verfügbar.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SettingsSection;
