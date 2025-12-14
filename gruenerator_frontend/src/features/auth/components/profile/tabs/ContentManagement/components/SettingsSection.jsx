import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from "motion/react";
import { GiHedgehog } from 'react-icons/gi';
import { getIcon, NotebookIcon } from '../../../../../../../config/icons';
import FeatureToggle from '../../../../../../../components/common/FeatureToggle';
import { useBetaFeatures } from '../../../../../../../hooks/useBetaFeatures';
import {
    HiOutlineExternalLink,
    HiOutlineDatabase,
    HiOutlinePhotograph,
    HiOutlineAcademicCap,
    HiOutlineUser,
    HiOutlineUsers,
    HiOutlineOfficeBuilding,
    HiChip,
    HiOutlineDocumentText,
    HiSave,
    HiSparkles,
    HiOutlineChat
} from 'react-icons/hi';

const BETA_VIEWS = {
    DATABASE: 'database',
    YOU: 'you',
    COLLAB: 'collab',
    QA: 'qa',
    ELEARNING: 'e_learning',
    BUNDESTAG_API: 'bundestag_api_enabled',
    MEMORY: 'memory',
    CANVA: 'canva',
    INTERACTIVE_ANTRAG: 'interactiveAntrag',
    AUTO_SAVE_EXPORT: 'autoSaveOnExport',
    AI_SHAREPIC: 'aiSharepic',
    CHAT: 'chat',
    GROUPS: 'groups',
    WEBSITE: 'website',
};

const SettingsSection = ({
    isActive,
    onSuccessMessage,
    onErrorMessage,
    igelActive,
    onToggleIgelModus,
    laborActive,
    onToggleLaborModus,
    isBetaFeaturesUpdating
}) => {
    const {
        getBetaFeatureState,
        updateUserBetaFeatures,
        getAvailableFeatures,
        isAdmin
    } = useBetaFeatures();

    const getBetaFeatureConfig = (viewKey) => {
        switch (viewKey) {
            case BETA_VIEWS.DATABASE:
                return {
                    title: 'Texte & Vorlagen',
                    description: 'Zugang zur Datenbank mit Texten und Vorlagen für deine Arbeit.',
                    checked: getBetaFeatureState('database'),
                    setter: (value) => updateUserBetaFeatures('database', value),
                    featureName: 'Datenbank',
                    checkboxLabel: '\'Texte & Vorlagen\'-Tab (Datenbank) anzeigen und Funktionalität aktivieren',
                    linkTo: '/datenbank',
                    linkText: 'Zur Datenbank',
                    icon: HiOutlineDatabase
                };
            case BETA_VIEWS.YOU:
                return {
                    title: 'You Grünerator',
                    description: 'Personalisierte Inhalte basierend auf deinem Profil und deinen Vorlieben.',
                    checked: getBetaFeatureState('you'),
                    setter: (value) => updateUserBetaFeatures('you', value),
                    featureName: 'You Generator',
                    checkboxLabel: 'You Grünerator aktivieren',
                    linkTo: '/you',
                    linkText: 'Zum You Grünerator',
                    icon: HiOutlineUser
                };
            case BETA_VIEWS.COLLAB:
                return {
                    title: 'Kollaborative Bearbeitung',
                    description: 'Arbeite in Echtzeit mit anderen an Dokumenten und Texten.',
                    checked: getBetaFeatureState('collab'),
                    setter: (value) => updateUserBetaFeatures('collab', value),
                    featureName: 'Kollaborative Bearbeitung',
                    checkboxLabel: 'Kollaborative Bearbeitung aktivieren',
                    icon: HiOutlineUsers
                };
                case BETA_VIEWS.QA:
                return {
                    title: 'Notebooks',
                    description: 'Erstelle intelligente Fragesysteme basierend auf deinen Dokumenten für natürliche Gespräche.',
                    checked: getBetaFeatureState('qa'),
                    setter: (value) => updateUserBetaFeatures('qa', value),
                    featureName: 'Notebooks',
                    checkboxLabel: 'Notebook-Tab in Texte & Grafik anzeigen und Funktionalität aktivieren',
                    icon: NotebookIcon
                };
            case BETA_VIEWS.ELEARNING:
                return {
                    title: 'E-Learning',
                    description: 'Interaktive E-Learning Module über grüne Politik, Klimaschutz und nachhaltiges Engagement. Erweitere dein Wissen mit strukturierten Lernpfaden.',
                    checked: getBetaFeatureState('e_learning'),
                    setter: (value) => updateUserBetaFeatures('e_learning', value),
                    featureName: 'E-Learning',
                    checkboxLabel: 'E-Learning Module aktivieren',
                    linkTo: '/e-learning',
                    linkText: 'Zu den Lernmodulen',
                    icon: HiOutlineAcademicCap
                };
            case BETA_VIEWS.BUNDESTAG_API:
                return {
                    title: 'Bundestag API',
                    description: 'Integration mit der Bundestag API (DIP - Dokumentations- und Informationssystem für Parlamentsmaterialien) um parlamentarische Dokumente, Drucksachen und Plenarprotokolle in deine Anträge einzubeziehen.',
                    checked: getBetaFeatureState('bundestag_api_enabled'),
                    setter: (value) => updateUserBetaFeatures('bundestag_api_enabled', value),
                    featureName: 'Bundestag API',
                    checkboxLabel: 'Bundestag API für parlamentarische Dokumente aktivieren',
                    linkTo: '/bundestag',
                    linkText: 'Zum Bundestag-Suchportal',
                    icon: HiOutlineOfficeBuilding
                };
            case BETA_VIEWS.MEMORY:
                return {
                    title: 'Memory (Mem0ry)',
                    description: 'Personalisierte KI-Memories, die sich wichtige Informationen über dich merken und bei der Texterstellung berücksichtigen. Aktiviere diese Funktion, um individualisierte Inhalte zu erhalten.',
                    checked: getBetaFeatureState('memory'),
                    setter: (value) => updateUserBetaFeatures('memory', value),
                    featureName: 'Memory',
                    checkboxLabel: 'Memory-Tab in der Intelligenz-Sektion aktivieren',
                    icon: HiChip
                };
            case BETA_VIEWS.CANVA:
                return {
                    title: 'Canva Integration',
                    description: 'Erweiterte Canva-Integration mit Zugriff auf deine Designs, Vorlagen und Assets. Synchronisiere deine Canva-Inhalte und nutze sie direkt in der Grünerator-Plattform.',
                    checked: getBetaFeatureState('canva'),
                    setter: (value) => updateUserBetaFeatures('canva', value),
                    featureName: 'Canva Integration',
                    checkboxLabel: 'Canva-Tab in Texte & Grafik anzeigen und Funktionalität aktivieren',
                    icon: HiOutlinePhotograph
                };
            case BETA_VIEWS.INTERACTIVE_ANTRAG:
                return {
                    title: 'Interaktiver Antrag',
                    description: 'KI-gestützte Antragserstellung mit intelligenten Rückfragen. Der Assistent stellt dir gezielte Fragen zu deinem Anliegen und erstellt einen maßgeschneiderten Antrag basierend auf deinen Antworten.',
                    checked: getBetaFeatureState('interactiveAntrag'),
                    setter: (value) => updateUserBetaFeatures('interactiveAntrag', value),
                    featureName: 'Interaktiver Antrag',
                    checkboxLabel: 'Interaktiven Antrag-Modus in Anträgen aktivieren',
                    icon: HiOutlineDocumentText
                };
            case BETA_VIEWS.AUTO_SAVE_EXPORT:
                return {
                    title: 'Auto-Speichern bei Export',
                    description: 'Speichere jeden Export (PDF, DOCX, Etherpad, Wolke, Kopieren) automatisch in deiner Textbibliothek. Verhindert doppelte Speicherungen innerhalb der gleichen Sitzung.',
                    checked: getBetaFeatureState('autoSaveOnExport'),
                    setter: (value) => updateUserBetaFeatures('autoSaveOnExport', value),
                    featureName: 'Auto-Speichern bei Export',
                    checkboxLabel: 'Automatisches Speichern bei jedem Export aktivieren',
                    icon: HiSave
                };
            case BETA_VIEWS.AI_SHAREPIC:
                return {
                    title: 'KI-Sharepic',
                    description: 'KI-gestützte Sharepic-Erstellung aus natürlicher Sprache. Beschreibe einfach, was du möchtest, und die KI erstellt automatisch das passende Sharepic.',
                    checked: getBetaFeatureState('aiSharepic'),
                    setter: (value) => updateUserBetaFeatures('aiSharepic', value),
                    featureName: 'KI-Sharepic',
                    checkboxLabel: 'KI-Sharepic im Sharepic-Grünerator aktivieren',
                    linkTo: '/sharepic',
                    linkText: 'Zum Sharepic-Grünerator',
                    icon: HiSparkles
                };
            case BETA_VIEWS.CHAT:
                return {
                    title: 'Grünerator Chat',
                    description: 'Interaktiver Chat-Assistent für direkte Gespräche mit dem Grünerator. Stelle Fragen und erhalte KI-gestützte Antworten.',
                    checked: getBetaFeatureState('chat'),
                    setter: (value) => updateUserBetaFeatures('chat', value),
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
                    setter: (value) => updateUserBetaFeatures('groups', value),
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
                    setter: (value) => updateUserBetaFeatures('website', value),
                    featureName: 'Website Generator',
                    checkboxLabel: 'Website Generator aktivieren',
                    linkTo: '/website',
                    linkText: 'Zum Website Generator',
                    icon: getIcon('navigation', 'website')
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
                    <div className="form-group-title">Mitgliedschaften</div>
                    <FeatureToggle
                        isActive={igelActive}
                        onToggle={onToggleIgelModus}
                        label="Igel-Modus"
                        icon={GiHedgehog}
                        description="Aktiviere den Igel-Modus, um als Mitglied der Grünen Jugend erkannt zu werden. Dies beeinflusst deine Erfahrung und verfügbare Funktionen."
                        className="igel-modus-toggle"
                        disabled={isBetaFeaturesUpdating}
                    />
                </div>

                <hr className="form-divider" />

                <div className="form-group">
                    <div className="form-group-title">Experimentell</div>
                    <FeatureToggle
                        isActive={laborActive}
                        onToggle={onToggleLaborModus}
                        label="Labor-Modus"
                        icon={getIcon('actions', 'labor')}
                        description="Aktiviere den Labor-Modus für Zugriff auf experimentelle Features und Beta-Funktionen. Diese Features befinden sich noch in Entwicklung."
                        className="labor-modus-toggle"
                        disabled={isBetaFeaturesUpdating}
                    />

                    {laborActive && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            style={{ marginTop: 'var(--spacing-large)' }}
                        >
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
                                                <p className="group-description">
                                                    {config.description}
                                                </p>

                                                <div className="labor-tab-toggle-container">
                                                    <FeatureToggle
                                                        isActive={config.checked}
                                                        onToggle={(checked) => {
                                                            config.setter(checked);
                                                            onSuccessMessage(`${config.featureName} Beta-Test ${checked ? 'aktiviert' : 'deaktiviert'}.`);
                                                        }}
                                                        label={config.checkboxLabel}
                                                        icon={config.icon}
                                                        description={config.description}
                                                        className="labor-feature-toggle"
                                                    />
                                                </div>

                                                {config.linkTo && config.checked && (
                                                    <Link
                                                        to={config.linkTo}
                                                        className="profile-action-button profile-secondary-button labor-tab-external-link"
                                                    >
                                                        {config.linkText} <HiOutlineExternalLink className="labor-tab-external-link-icon"/>
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {!isAdmin && getAvailableFeatures().some(f => f.isAdminOnly) && (
                                <div className="profile-card" style={{marginTop: 'var(--spacing-large)'}}>
                                    <div className="profile-card-header">
                                        <h3>Administrator-Features</h3>
                                    </div>
                                    <div className="profile-card-content">
                                        <p><strong>Hinweis:</strong> Einige Beta-Features sind nur für Administratoren verfügbar.</p>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SettingsSection;
