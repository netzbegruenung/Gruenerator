import { useAddShareLink, validateShareLink, type WolkeScope } from '@gruenerator/wolke';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

interface WolkeAddFormProps {
  scope?: WolkeScope;
  scopeId?: string | null;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

const INPUT_CLASS =
  'w-full rounded-lg border border-grey-200 dark:border-grey-700 bg-background px-md py-md text-base focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 disabled:opacity-50';

const WolkeAddForm = ({ scope, scopeId, onSuccess, onError }: WolkeAddFormProps) => {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [validationError, setValidationError] = useState('');

  const addMutation = useAddShareLink(scope, scopeId);
  const labelRef = useRef<HTMLInputElement>(null);

  const isValidLink = validateShareLink(url).isValid;

  useEffect(() => {
    if (isValidLink) {
      labelRef.current?.focus();
    }
  }, [isValidLink]);

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setValidationError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const validation = validateShareLink(url);
    if (!validation.isValid) {
      setValidationError(validation.error || 'Ungültiger Link');
      return;
    }

    setValidationError('');

    try {
      await addMutation.mutateAsync({ url, label });
      setUrl('');
      setLabel('');
      onSuccess?.('Wolke-Verbindung wurde erfolgreich hinzugefügt.');
    } catch (error) {
      onError?.(
        'Fehler beim Hinzufügen: ' + (error instanceof Error ? error.message : String(error))
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-md">
      <p className="text-base text-grey-600 dark:text-grey-300 m-0">
        Erstelle in deiner Nextcloud einen Share-Link mit Schreibzugriff und füge ihn hier ein.{' '}
        <a
          href="https://doku.services.moritz-waechter.de/docs/Profil/gruene-wolke-tutorial"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-500 dark:text-primary-400 hover:underline"
        >
          Anleitung ansehen
        </a>
      </p>
      <div className="flex flex-col gap-xxs">
        <input
          id="wolke-url"
          type="url"
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="Nextcloud Share-Link einfügen..."
          required
          disabled={addMutation.isPending}
          className={cn(INPUT_CLASS, isValidLink && 'border-primary-500')}
        />
        {validationError && (
          <span className="text-xs text-red-600 dark:text-red-400">{validationError}</span>
        )}
        {!isValidLink && !validationError && url.length > 0 && (
          <span className="text-xs text-grey-400">
            Der Link sollte mit /s/ beginnen (z.B. wolke.netzbegruenung.de/s/...)
          </span>
        )}
      </div>

      <div
        className={cn(
          'grid transition-all duration-200 ease-out',
          isValidLink ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-md">
            <input
              ref={labelRef}
              id="wolke-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Bezeichnung (optional)"
              disabled={addMutation.isPending}
              className={INPUT_CLASS}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={addMutation.isPending} size="sm">
                {addMutation.isPending ? 'Wird hinzugefügt...' : 'Hinzufügen'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};

export default WolkeAddForm;
