import React, { useState } from 'react';
import { FaCloud } from 'react-icons/fa';
import { HiX, HiCheck, HiExclamationCircle } from 'react-icons/hi';

import { NextcloudShareManager } from '../../../utils/nextcloudShareManager';

// Wolke Feature CSS - Loaded only when this feature is accessed
import '../../../assets/styles/features/wolke/wolke.css';

/**
 * Modal component for setting up Wolke (Nextcloud) share links
 * Shows when user tries to export to Wolke but has no connections configured
 */
interface WolkeSetupModalProps {
  onClose: () => void;
  onSubmit: (shareLink: string, label: string) => Promise<void>;
}

const WolkeSetupModal = ({ onClose, onSubmit }: WolkeSetupModalProps) => {
  const [shareLink, setShareLink] = useState('');
  const [label, setLabel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validation = NextcloudShareManager.validateShareLink(shareLink);
    if (!validation.isValid) {
      setValidationError(validation.error || '');
      return;
    }

    setIsSubmitting(true);
    setValidationError('');

    try {
      await onSubmit(shareLink.trim(), label.trim());
      onClose();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      setValidationError('Fehler beim Einrichten der Wolke-Verbindung: ' + errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShareLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShareLink(e.target.value);
    setValidationError('');
  };

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLabel(e.target.value);
  };

  return (
    <div className="wolke-modal-overlay" onClick={onClose}>
      <div className="wolke-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="wolke-modal-header">
          <div className="wolke-modal-title">
            <FaCloud size={20} />
            Wolke-Verbindung einrichten
          </div>
          <button className="wolke-modal-close" onClick={onClose} aria-label="Schließen">
            <HiX size={18} />
          </button>
        </div>

        <div className="wolke-modal-content">
          <p className="wolke-modal-description">
            Um Dateien in der Grünen Wolke zu speichern, benötigst du einen beschreibbaren
            Nextcloud-Share-Link. Eine detaillierte Schritt-für-Schritt Anleitung findest du{' '}
            <a
              href="https://doku.services.moritz-waechter.de/docs/Profil/gruene-wolke-tutorial"
              target="_blank"
              rel="noopener noreferrer"
            >
              hier
            </a>{' '}
            in unserer Dokumentation.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="wolke-form-group">
              <label htmlFor="shareLink">Nextcloud Share-Link *</label>
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
              <label htmlFor="label">Bezeichnung (optional)</label>
              <input
                type="text"
                id="label"
                value={label}
                onChange={handleLabelChange}
                placeholder="z.B. Ortsverband, Mein Ordner, Grünerator..."
                disabled={isSubmitting}
              />
              <small className="wolke-form-hint">Ein Name zur besseren Identifikation</small>
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
    </div>
  );
};

export default WolkeSetupModal;
