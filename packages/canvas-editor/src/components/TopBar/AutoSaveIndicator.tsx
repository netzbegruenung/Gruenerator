import { useEffect, useState } from 'react';
import { FaCheck, FaExclamationTriangle } from 'react-icons/fa';

import { useAutoSaveStore } from '../../stores/useAutoSaveStore';

import { cn } from '../../utils/cn';

/**
 * Autosave status as a single glyph: spinner while saving, a check that fades
 * after two seconds, a retry button on error. Shared by the desktop rail and
 * the mobile menu bar (`onDark`).
 */
export function AutoSaveIndicator({ onDark = false }: { onDark?: boolean }) {
  const autoSaveStatus = useAutoSaveStore((s) => s.autoSaveStatus);
  const retryAutoSave = useAutoSaveStore((s) => s.retryAutoSave);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (autoSaveStatus === 'saved') {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoSaveStatus]);

  if (!autoSaveStatus) return null;

  return (
    <div
      className={cn(
        'flex items-center justify-center size-10 opacity-0 transition-opacity duration-300',
        (autoSaveStatus === 'saving' || autoSaveStatus === 'error' || showSaved) && 'opacity-100'
      )}
      role="status"
      title={
        autoSaveStatus === 'saving'
          ? 'Wird gespeichert...'
          : autoSaveStatus === 'saved'
            ? 'Gespeichert'
            : autoSaveStatus === 'error'
              ? 'Fehler beim Speichern — klicken zum Wiederholen'
              : ''
      }
    >
      {autoSaveStatus === 'saving' && (
        <div
          className={cn(
            'size-4 border-2 rounded-full animate-auto-save-spin',
            onDark
              ? 'border-white/30 border-t-white'
              : 'border-[var(--border-subtle)] border-t-[var(--interactive-accent-color)]'
          )}
        />
      )}
      {showSaved && (
        <FaCheck
          size={14}
          className={cn('animate-auto-save-check', onDark ? 'text-white' : 'text-green-500')}
        />
      )}
      {autoSaveStatus === 'error' && (
        <button
          className="bg-transparent border-none p-0 cursor-pointer flex items-center justify-center"
          onClick={() => retryAutoSave?.()}
          aria-label="Speichern erneut versuchen"
          type="button"
        >
          <FaExclamationTriangle size={14} className={onDark ? 'text-amber-300' : 'text-red-500'} />
        </button>
      )}
    </div>
  );
}
