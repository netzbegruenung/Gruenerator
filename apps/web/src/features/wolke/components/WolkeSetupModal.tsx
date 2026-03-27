import { validateShareLink } from '@gruenerator/wolke';
import React, { useState } from 'react';
import { FaCloud } from 'react-icons/fa';
import { HiX, HiCheck, HiExclamationCircle } from 'react-icons/hi';

import { cn } from '../../../utils/cn';

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

    const validation = validateShareLink(shareLink);
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
    <div
      className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1001] backdrop-blur-[5px] p-md max-md:p-sm"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.2)] max-w-[500px] max-md:max-w-full w-full max-h-[90vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-lg max-md:p-md border-b border-grey-200 dark:border-grey-700">
          <div className="flex items-center gap-sm text-foreground-heading text-lg font-semibold m-0">
            <FaCloud size={20} />
            Wolke-Verbindung einrichten
          </div>
          <button
            className="flex items-center justify-center size-8 border-none bg-none text-grey-600 cursor-pointer rounded-md transition-all duration-200 hover:bg-grey-100 hover:text-grey-800 motion-reduce:transition-none"
            onClick={onClose}
            aria-label="Schließen"
          >
            <HiX size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-md p-lg max-md:p-md">
          <p className="m-0 mb-md text-foreground text-sm leading-relaxed">
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
            <div className="flex flex-col gap-xs">
              <label htmlFor="shareLink" className="font-medium text-foreground-heading text-sm">
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
                className="px-md py-sm border border-grey-300 rounded-lg text-sm transition-[border-color,box-shadow] duration-200 bg-background-pure focus:outline-none focus:border-secondary-600 focus:shadow-[0_0_0_3px_var(--secondary-50)] disabled:bg-grey-50 disabled:text-grey-500 disabled:cursor-not-allowed"
              />
              <small className="text-grey-600 text-xs leading-snug">
                Der Link sollte mit /s/ beginnen und beschreibbar sein
              </small>
            </div>

            <div className="flex flex-col gap-xs mt-md">
              <label htmlFor="label" className="font-medium text-foreground-heading text-sm">
                Bezeichnung (optional)
              </label>
              <input
                type="text"
                id="label"
                value={label}
                onChange={handleLabelChange}
                placeholder="z.B. Ortsverband, Mein Ordner, Grünerator..."
                disabled={isSubmitting}
                className="px-md py-sm border border-grey-300 rounded-lg text-sm transition-[border-color,box-shadow] duration-200 bg-background-pure focus:outline-none focus:border-secondary-600 focus:shadow-[0_0_0_3px_var(--secondary-50)] disabled:bg-grey-50 disabled:text-grey-500 disabled:cursor-not-allowed"
              />
              <small className="text-grey-600 text-xs leading-snug">
                Ein Name zur besseren Identifikation
              </small>
            </div>

            {validationError && (
              <div className="flex items-center gap-sm text-[var(--error-red)] text-sm px-md py-sm bg-[#fef2f2] rounded-md border border-[var(--error-red)] mt-md">
                <HiExclamationCircle size={16} />
                {validationError}
              </div>
            )}

            <div className="flex justify-end gap-md p-lg max-md:p-md max-md:flex-col max-md:gap-sm border-t border-grey-200 dark:border-grey-700 mt-md">
              <button
                type="button"
                className={cn(
                  'px-lg py-sm rounded-lg font-medium text-sm cursor-pointer transition-all duration-200 flex items-center gap-sm min-w-[100px] justify-center motion-reduce:transition-none',
                  'bg-none border border-grey-300 text-foreground hover:enabled:bg-grey-50 hover:enabled:border-grey-400',
                  'disabled:opacity-50 disabled:cursor-not-allowed max-md:w-full'
                )}
                onClick={onClose}
                disabled={isSubmitting}
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className={cn(
                  'px-lg py-sm rounded-lg font-medium text-sm cursor-pointer transition-all duration-200 flex items-center gap-sm min-w-[100px] justify-center motion-reduce:transition-none',
                  'bg-secondary-600 text-white border-none hover:enabled:bg-secondary-700 hover:enabled:-translate-y-px hover:enabled:shadow-sm',
                  'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none max-md:w-full'
                )}
                disabled={isSubmitting || !shareLink.trim()}
              >
                {isSubmitting ? (
                  <>
                    <div className="size-4 border-2 border-transparent border-t-current rounded-full animate-spin" />
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

          <div className="mt-md p-md bg-background-alt rounded-lg border-l-[3px] border-secondary-600">
            <h4 className="m-0 mb-sm text-sm font-semibold text-foreground-heading">
              So erhalten Sie einen Share-Link:
            </h4>
            <ol className="m-0 pl-md text-[0.8rem] max-md:text-xs text-foreground leading-relaxed">
              <li className="mb-xxs">Öffnen Sie Ihre Nextcloud-Instanz</li>
              <li className="mb-xxs">Erstellen Sie einen neuen Ordner oder wählen Sie einen bestehenden</li>
              <li className="mb-xxs">Klicken Sie auf "Teilen" und erstellen Sie einen öffentlichen Link</li>
              <li className="mb-xxs">Aktivieren Sie "Hochladen erlauben" für beschreibbaren Zugriff</li>
              <li className="mb-xxs">Kopieren Sie den Link hierher</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WolkeSetupModal;
