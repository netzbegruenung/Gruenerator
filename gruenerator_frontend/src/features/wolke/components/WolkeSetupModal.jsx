import React, { useState } from 'react';
import { HiX, HiCheck, HiExclamationCircle, HiAcademicCap } from 'react-icons/hi';
import { FaCloud } from 'react-icons/fa';
import { validateShareLink } from '../../../components/utils/nextcloudUtils';
import WolkeTutorial from './WolkeTutorial';

/**
 * Modal component for setting up Wolke (Nextcloud) share links
 * Shows when user tries to export to Wolke but has no connections configured
 */
const WolkeSetupModal = ({ onClose, onSubmit }) => {
    const [shareLink, setShareLink] = useState('');
    const [label, setLabel] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [validationError, setValidationError] = useState('');
    const [showTutorial, setShowTutorial] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        const validation = validateShareLink(shareLink);
        if (!validation.isValid) {
            setValidationError(validation.error);
            return;
        }

        setIsSubmitting(true);
        setValidationError('');
        
        try {
            await onSubmit(shareLink.trim(), label.trim());
            onClose();
        } catch (error) {
            setValidationError('Fehler beim Einrichten der Wolke-Verbindung: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleShareLinkChange = (e) => {
        setShareLink(e.target.value);
        setValidationError('');
    };

    const handleLabelChange = (e) => {
        setLabel(e.target.value);
    };

    const handleTutorialOpen = () => {
        setShowTutorial(true);
    };

    const handleTutorialClose = () => {
        setShowTutorial(false);
    };

    return (
        <div className="wolke-modal-overlay" onClick={onClose}>
            <div className="wolke-modal" onClick={(e) => e.stopPropagation()}>
                <div className="wolke-modal-header">
                    <div className="wolke-modal-title">
                        <FaCloud size={20} />
                        Wolke-Verbindung einrichten
                    </div>
                    <button
                        className="wolke-modal-close"
                        onClick={onClose}
                        aria-label="Schließen"
                    >
                        <HiX size={18} />
                    </button>
                </div>

                <div className="wolke-modal-content">
                    <p className="wolke-modal-description">
                        Um Dateien in der Grünen Wolke zu speichern, benötigen Sie einen beschreibbaren Nextcloud-Share-Link.
                    </p>

                    {/* Tutorial button */}
                    <div className="wolke-setup-tutorial-section">
                        <button
                            type="button"
                            className="wolke-setup-tutorial-button"
                            onClick={handleTutorialOpen}
                        >
                            <HiAcademicCap size={18} />
                            Tutorial starten
                        </button>
                        <p className="wolke-setup-tutorial-description">
                            Schritt-für-Schritt Anleitung zum Erstellen eines Share-Links
                        </p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="wolke-form-group">
                            <label htmlFor="shareLink">
                                Nextcloud Share-Link *
                            </label>
                            <input
                                type="url"
                                id="shareLink"
                                value={shareLink}
                                onChange={handleShareLinkChange}
                                placeholder="https://wolke.netzbegruenung.de/s/AbCdEfGhIj"
                                required
                                disabled={isSubmitting}
                            />
                            <small className="wolke-form-hint">
                                Der Link sollte mit /s/ beginnen und beschreibbar sein
                            </small>
                        </div>

                        <div className="wolke-form-group">
                            <label htmlFor="label">
                                Bezeichnung (optional)
                            </label>
                            <input
                                type="text"
                                id="label"
                                value={label}
                                onChange={handleLabelChange}
                                placeholder="z.B. Ortsverband, Mein Ordner, Grünerator..."
                                disabled={isSubmitting}
                            />
                            <small className="wolke-form-hint">
                                Ein Name zur besseren Identifikation
                            </small>
                        </div>

                        {validationError && (
                            <div className="wolke-modal-error">
                                <HiExclamationCircle size={16} />
                                {validationError}
                            </div>
                        )}

                        <div className="wolke-modal-actions">
                            <button
                                type="button"
                                className="button-secondary"
                                onClick={onClose}
                                disabled={isSubmitting}
                            >
                                Abbrechen
                            </button>
                            <button
                                type="submit"
                                className="button-primary"
                                disabled={isSubmitting || !shareLink.trim()}
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="spinner-small" />
                                        Einrichte...
                                    </>
                                ) : (
                                    <>
                                        <HiCheck size={16} />
                                        Verbindung einrichten
                                    </>
                                )}
                            </button>
                        </div>
                    </form>

                    <div className="wolke-setup-help">
                        <h4>So erhalten Sie einen Share-Link:</h4>
                        <ol>
                            <li>Öffnen Sie Ihre Nextcloud-Instanz</li>
                            <li>Erstellen Sie einen neuen Ordner oder wählen Sie einen bestehenden</li>
                            <li>Klicken Sie auf "Teilen" und erstellen Sie einen öffentlichen Link</li>
                            <li>Aktivieren Sie "Hochladen erlauben" für beschreibbaren Zugriff</li>
                            <li>Kopieren Sie den Link hierher</li>
                        </ol>
                    </div>
                </div>
            </div>
            
            {/* Tutorial overlay */}
            {showTutorial && (
                <WolkeTutorial onClose={handleTutorialClose} />
            )}
        </div>
    );
};

export default WolkeSetupModal;