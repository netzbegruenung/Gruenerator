import { useState, type FormEvent } from 'react';

import { useAddShareLink } from '../hooks/useWolke';
import { validateShareLink, type WolkeScope } from '../lib/wolkeApi';

import { Button } from '@/components/ui/button';

interface WolkeAddFormProps {
  scope?: WolkeScope;
  scopeId?: string | null;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

const WolkeAddForm = ({ scope, scopeId, onSuccess, onError }: WolkeAddFormProps) => {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [validationError, setValidationError] = useState('');

  const addMutation = useAddShareLink(scope, scopeId);

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-sm">
      <div className="flex flex-col gap-xxs">
        <label htmlFor="wolke-url" className="text-sm font-medium text-foreground">
          Nextcloud Share-Link *
        </label>
        <input
          id="wolke-url"
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setValidationError('');
          }}
          placeholder="https://wolke.netzbegruenung.de/s/AbCdEfGhIj"
          required
          disabled={addMutation.isPending}
          className="w-full rounded-md border border-grey-200 dark:border-grey-700 bg-background px-sm py-xs text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 disabled:opacity-50"
        />
        <span className="text-xs text-grey-400">
          Der Link sollte mit /s/ beginnen und beschreibbar sein
        </span>
      </div>

      <div className="flex flex-col gap-xxs">
        <label htmlFor="wolke-label" className="text-sm font-medium text-foreground">
          Bezeichnung (optional)
        </label>
        <input
          id="wolke-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="z.B. Ortsverband, Mein Ordner, Grünerator..."
          disabled={addMutation.isPending}
          className="w-full rounded-md border border-grey-200 dark:border-grey-700 bg-background px-sm py-xs text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 disabled:opacity-50"
        />
      </div>

      {validationError && (
        <div className="text-sm text-red-600 dark:text-red-400">{validationError}</div>
      )}

      <div className="flex items-center justify-between">
        <a
          href="https://doku.services.moritz-waechter.de/docs/Profil/gruene-wolke-tutorial"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary-600 hover:underline"
        >
          Anleitung ansehen
        </a>
        <Button type="submit" disabled={addMutation.isPending || !url.trim()} size="sm">
          {addMutation.isPending ? 'Wird hinzugefügt...' : 'Hinzufügen'}
        </Button>
      </div>
    </form>
  );
};

export default WolkeAddForm;
