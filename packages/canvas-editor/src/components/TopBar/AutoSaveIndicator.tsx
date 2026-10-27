import { useMessages } from '@ggraphic/editor/i18n/messages';
import { useAutoSaveStore } from '@ggraphic/editor/stores/useAutoSaveStore';
import { cn } from '@ggraphic/editor/utils/cn';
import { useEffect, useState } from 'react';
import { FaCheck, FaExclamationTriangle } from 'react-icons/fa';

/**
 * Autosave status as a single glyph: spinner while saving, a check that fades
 * after two seconds, a retry button on error. Shared by the desktop rail and
 * the mobile menu bar (`onDark`).
 */
export function AutoSaveIndicator({ onDark = false }: { onDark?: boolean }) {
  const t = useMessages();
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

  const statusText =
    autoSaveStatus === 'saving'
      ? t.topBar.saveShort
      : autoSaveStatus === 'saved'
        ? 'Gespeichert'
        : t.topBar.saveErrorShort;

  return (
    <div
      className={cn(
        'flex items-center justify-center size-10 opacity-0 transition-opacity duration-300',
        (autoSaveStatus === 'saving' || autoSaveStatus === 'error' || showSaved) && 'opacity-100'
      )}
      role="status"
      title={
        autoSaveStatus === 'saving'
          ? t.topBar.saving
          : autoSaveStatus === 'saved'
            ? 'Gespeichert'
            : autoSaveStatus === 'error'
              ? t.topBar.saveErrorRetry
              : ''
      }
    >
      <span className="sr-only">{statusText}</span>
      {autoSaveStatus === 'saving' && (
        <div
          aria-hidden="true"
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
          aria-hidden="true"
          size={14}
          className={cn('animate-auto-save-check', onDark ? 'text-white' : 'text-green-500')}
        />
      )}
      {autoSaveStatus === 'error' && (
        <button
          className="touch-target bg-transparent border-none p-0 cursor-pointer flex items-center justify-center min-w-6 min-h-6"
          onClick={() => retryAutoSave?.()}
          aria-label={t.topBar.saveRetry}
          type="button"
        >
          <FaExclamationTriangle
            aria-hidden="true"
            size={14}
            className={onDark ? 'text-amber-300' : 'text-red-500'}
          />
        </button>
      )}
    </div>
  );
}
