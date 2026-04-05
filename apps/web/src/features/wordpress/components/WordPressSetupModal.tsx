import { useState } from 'react';
import { FaWordpress } from 'react-icons/fa6';
import { HiX, HiCheck, HiExclamationCircle } from 'react-icons/hi';
import { IoCheckmarkCircleOutline } from 'react-icons/io5';

import { cn } from '../../../utils/cn';
import { useTestWordPressConnection, useAddWordPressSite } from '../hooks/useWordPress';

interface WordPressSetupModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const WordPressSetupModal = ({ onClose, onSuccess }: WordPressSetupModalProps) => {
  const [siteUrl, setSiteUrl] = useState('');
  const [username, setUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [label, setLabel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [testSuccess, setTestSuccess] = useState(false);
  const [testDetails, setTestDetails] = useState('');

  const testConnection = useTestWordPressConnection();
  const addSite = useAddWordPressSite();

  const handleTestConnection = async () => {
    if (!siteUrl.trim() || !username.trim() || !appPassword.trim()) {
      setError('Bitte fülle alle Pflichtfelder aus.');
      return;
    }

    setError('');
    setTestSuccess(false);
    setTestDetails('');

    try {
      const result = await testConnection.mutateAsync({
        siteUrl,
        username,
        appPassword,
      });
      if (result.success) {
        setTestSuccess(true);
        const details = [
          result.siteName && `Seite: ${result.siteName}`,
          result.displayName && `Angemeldet als: ${result.displayName}`,
        ]
          .filter(Boolean)
          .join(' · ');
        if (details) {
          setTestDetails(details);
        }
      } else {
        setError(result.error || result.message || 'Verbindungstest fehlgeschlagen.');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setError('Verbindungstest fehlgeschlagen: ' + errorMessage);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!siteUrl.trim() || !username.trim() || !appPassword.trim()) {
      setError('Bitte fülle alle Pflichtfelder aus.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await addSite.mutateAsync({
        siteUrl,
        username,
        appPassword,
        label: label.trim() || null,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setError('Fehler beim Verbinden: ' + errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClasses =
    'px-md py-sm border border-grey-300 rounded-lg text-sm transition-[border-color,box-shadow] duration-200 bg-background-pure focus:outline-none focus:border-secondary-600 focus:shadow-[0_0_0_3px_var(--secondary-50)] disabled:bg-grey-50 disabled:text-grey-500 disabled:cursor-not-allowed';

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
            <FaWordpress size={20} />
            WordPress verbinden
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
            Erstelle ein Anwendungspasswort in deinem WordPress-Admin unter Benutzer*innen &rarr;
            Profil &rarr; Anwendungspasswörter.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-xs">
              <label htmlFor="wp-site-url" className="font-medium text-foreground-heading text-sm">
                WordPress-URL *
              </label>
              <input
                type="url"
                id="wp-site-url"
                value={siteUrl}
                onChange={(e) => {
                  setSiteUrl(e.target.value);
                  setError('');
                  setTestSuccess(false);
                  setTestDetails('');
                }}
                placeholder="https://gruene-musterstadt.de"
                required
                disabled={isSubmitting}
                className={inputClasses}
              />
            </div>

            <div className="flex flex-col gap-xs mt-md">
              <label htmlFor="wp-username" className="font-medium text-foreground-heading text-sm">
                Benutzername *
              </label>
              <input
                type="text"
                id="wp-username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                  setTestSuccess(false);
                  setTestDetails('');
                }}
                required
                disabled={isSubmitting}
                className={inputClasses}
              />
            </div>

            <div className="flex flex-col gap-xs mt-md">
              <label
                htmlFor="wp-app-password"
                className="font-medium text-foreground-heading text-sm"
              >
                Anwendungspasswort *
              </label>
              <input
                type="password"
                id="wp-app-password"
                value={appPassword}
                onChange={(e) => {
                  setAppPassword(e.target.value);
                  setError('');
                  setTestSuccess(false);
                  setTestDetails('');
                }}
                required
                disabled={isSubmitting}
                className={inputClasses}
              />
              <small className="text-grey-600 text-xs leading-snug">
                Nicht dein normales Passwort — verwende ein Anwendungspasswort
              </small>
            </div>

            <div className="flex flex-col gap-xs mt-md">
              <label htmlFor="wp-label" className="font-medium text-foreground-heading text-sm">
                Bezeichnung (optional)
              </label>
              <input
                type="text"
                id="wp-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="z.B. Ortsverband Blog"
                disabled={isSubmitting}
                className={inputClasses}
              />
            </div>

            {error && (
              <div className="flex items-center gap-sm text-[var(--error-red)] text-sm px-md py-sm bg-[#fef2f2] rounded-md border border-[var(--error-red)] mt-md">
                <HiExclamationCircle size={16} />
                {error}
              </div>
            )}

            {testSuccess && (
              <div className="flex flex-col gap-xs text-secondary-700 text-sm px-md py-sm bg-secondary-50 rounded-md border border-secondary-300 mt-md">
                <div className="flex items-center gap-sm">
                  <IoCheckmarkCircleOutline size={16} />
                  Verbindung erfolgreich!
                </div>
                {testDetails && (
                  <span className="text-xs text-secondary-600 ml-[24px]">{testDetails}</span>
                )}
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
                onClick={handleTestConnection}
                disabled={
                  isSubmitting ||
                  testConnection.isPending ||
                  !siteUrl.trim() ||
                  !username.trim() ||
                  !appPassword.trim()
                }
              >
                {testConnection.isPending ? (
                  <>
                    <div className="size-4 border-2 border-transparent border-t-current rounded-full animate-spin" />
                    Teste...
                  </>
                ) : (
                  'Verbindung testen'
                )}
              </button>
              <button
                type="submit"
                className={cn(
                  'px-lg py-sm rounded-lg font-medium text-sm cursor-pointer transition-all duration-200 flex items-center gap-sm min-w-[100px] justify-center motion-reduce:transition-none',
                  'bg-secondary-600 text-white border-none hover:enabled:bg-secondary-700 hover:enabled:-translate-y-px hover:enabled:shadow-sm',
                  'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none max-md:w-full'
                )}
                disabled={
                  isSubmitting || !siteUrl.trim() || !username.trim() || !appPassword.trim()
                }
              >
                {isSubmitting ? (
                  <>
                    <div className="size-4 border-2 border-transparent border-t-current rounded-full animate-spin" />
                    Verbinde...
                  </>
                ) : (
                  <>
                    <HiCheck size={16} />
                    Verbinden
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default WordPressSetupModal;
