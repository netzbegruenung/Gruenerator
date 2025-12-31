import React from 'react';
import { motion } from "motion/react";
import { HiPlus } from 'react-icons/hi';
import HelpTooltip from '../../../../../../../components/common/HelpTooltip';

const GroupsOverviewSection = ({
    userGroups,
    isCreatingGroup,
    onCreateNew,
    tabIndex
}) => {
    return (
        <motion.div
            className="group-overview-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="group-content-card">
                <div className="group-info-panel">
                    <div className="group-header-section">
                        <div className="group-title-area">
                            <div className="header-with-help">
                                <h2 className="profile-user-name large-profile-title">Gruppenfunktion im Grünerator</h2>
                                <HelpTooltip>
                                    <p>
                                        Mit Gruppen kannst du Anweisungen und Wissen mit anderen teilen und gemeinsam nutzen.
                                    </p>
                                    <p>
                                        <strong>Tipp:</strong> Erstelle eine Gruppe für deinen Verband oder dein Team und lade andere über den Join-Link ein.
                                    </p>
                                </HelpTooltip>
                            </div>
                        </div>
                    </div>

                    <div className="group-overview-content">
                        <section className="group-overview-section">
                            <h3>Was sind Gruppen?</h3>
                            <p>
                                Gruppen im Grünerator ermöglichen dir, gemeinsam mit anderen Mitgliedern an Texten und Materialien zu arbeiten.
                                Als virtueller Arbeitsbereich kannst du spezifische Anweisungen und Wissen für deine Gruppe hinterlegen.
                            </p>
                        </section>

                        <section className="group-overview-section">
                            <h3>Was können Gruppen?</h3>
                            <ul>
                                <li>
                                    <strong>Gruppenanweisungen teilen:</strong> Lege spezifische Anweisungen für Anträge und Social-Media-Texte fest,
                                    die allen Gruppenmitgliedern zur Verfügung stehen.
                                </li>
                                <li>
                                    <strong>Gemeinsames Wissen nutzen:</strong> Hinterlege bis zu drei Wissensbausteine mit spezifischem Wissen deiner Gruppe.
                                </li>
                                <li>
                                    <strong>Konsistente Kommunikation:</strong> Sorge für einheitliche Texte und Formulierungen innerhalb deiner Gruppe.
                                </li>
                                <li>
                                    <strong>Zusammenarbeit fördern:</strong> Lade andere über einen Einladungslink ein und arbeite gemeinsam an Inhalten.
                                </li>
                            </ul>
                        </section>

                        <section className="group-overview-section">
                            <h3>Wie funktionieren Gruppen?</h3>
                            <p>
                                Nachdem du eine Gruppe erstellt hast, wirst du automatisch zum Admin. Als Admin kannst du:
                            </p>
                            <ul>
                                <li>Anweisungen für Anträge und Social Media festlegen und aktivieren</li>
                                <li>Wissensbausteine erstellen und bearbeiten</li>
                                <li>Andere Mitglieder über einen Einladungslink hinzufügen</li>
                            </ul>
                            <p>
                                Gruppenmitglieder können diese gemeinsamen Ressourcen beim Erstellen von Texten nutzen,
                                was zu einer einheitlichen und effizienten Kommunikation führt.
                            </p>
                        </section>

                        <div className="group-overview-cta">
                            {userGroups && userGroups.length > 0 ? (
                                <p>Du bist bereits Mitglied in {userGroups.length} Gruppe{userGroups.length > 1 ? 'n' : ''}. Wähle eine Gruppe aus der Seitenleiste oder erstelle eine neue.</p>
                            ) : (
                                <p>Du bist noch nicht Mitglied einer Gruppe. Erstelle jetzt deine erste Gruppe!</p>
                            )}

                            <div className="profile-actions profile-actions-centered">
                                <button
                                    onClick={onCreateNew}
                                    className="btn-primary size-m"
                                    disabled={isCreatingGroup}
                                    tabIndex={tabIndex.createGroupButton}
                                    aria-label="Neue Gruppe erstellen"
                                >
                                    <HiPlus className="icon" /> {isCreatingGroup ? 'Wird erstellt...' : 'Neue Gruppe erstellen'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default GroupsOverviewSection;
