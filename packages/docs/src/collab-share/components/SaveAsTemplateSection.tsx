import { Button } from '@gruenerator/ui';
import { useCallback, useState } from 'react';

interface SaveAsTemplateSectionProps {
  /** Platform-specific save call; throw to signal failure. */
  onSave: (title: string) => Promise<void>;
  defaultTitle?: string;
}

export const SaveAsTemplateSection = ({ onSave, defaultTitle }: SaveAsTemplateSectionProps) => {
  const [mode, setMode] = useState<'idle' | 'editing' | 'saving' | 'saved'>('idle');
  const [title, setTitle] = useState(defaultTitle ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Bitte gib der Vorlage einen Titel.');
      return;
    }
    try {
      setMode('saving');
      setError(null);
      await onSave(trimmed);
      setMode('saved');
      setTimeout(() => setMode('idle'), 2500);
    } catch (err) {
      console.error('Failed to save as template:', err);
      setError('Vorlage konnte nicht gespeichert werden.');
      setMode('editing');
    }
  }, [title, onSave]);

  return (
    <div className="border-t border-grey-200 pt-3 dark:border-grey-700">
      {mode === 'idle' && (
        <button
          type="button"
          onClick={() => {
            setMode('editing');
            setError(null);
          }}
          className="cursor-pointer border-none bg-transparent p-0 text-sm font-medium text-secondary-600 hover:underline"
        >
          Als Vorlage speichern
        </button>
      )}
      {mode === 'editing' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titel der Vorlage"
            className="h-8 min-w-[180px] flex-1 rounded-md border border-grey-300 bg-background px-2 text-sm outline-none focus:border-primary-500 dark:border-grey-600"
          />
          <Button size="sm" onClick={() => void handleSave()}>
            Speichern
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setMode('idle');
              setError(null);
            }}
          >
            Abbrechen
          </Button>
        </div>
      )}
      {mode === 'saving' && <p className="text-sm text-grey-500">Vorlage wird gespeichert…</p>}
      {mode === 'saved' && <p className="text-sm text-green-600">✓ Vorlage gespeichert</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};
