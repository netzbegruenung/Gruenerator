import { HiFolder } from 'react-icons/hi';

import FeatureToggle from '../../../components/common/FeatureToggle';

import { cn } from '@/utils/cn';

interface DocumentModeSelectorProps {
  currentMode?: 'wolke' | 'manual';
  onModeChange?: (mode: 'wolke' | 'manual') => void;
  loading?: boolean;
  disabled?: boolean;
  disabledMessage?: string | null;
}

/**
 * DocumentModeSelector - Toggle between Wolke and Manual document modes
 */
const DocumentModeSelector = ({
  currentMode = 'wolke',
  onModeChange,
  loading = false,
  disabled = false,
  disabledMessage = null,
}: DocumentModeSelectorProps): React.ReactElement => {
  const isWolkeMode = currentMode === 'wolke';

  const handleToggle = (useWolke: boolean) => {
    if (loading) return;

    // If trying to enable Wolke but it's disabled, prevent the toggle
    if (useWolke && disabled) return;

    // Allow switching away from Wolke even when disabled (to manual mode)
    const newMode = useWolke ? 'wolke' : 'manual';
    if (onModeChange) {
      onModeChange(newMode);
    }
  };

  return (
    <div className="mb-lg rounded-lg border border-grey-200 bg-background p-lg dark:border-grey-700">
      <div className="mb-lg text-center">
        <h3 className="m-0 mb-sm text-lg font-semibold text-foreground">Dokumenten-Verwaltung</h3>
        <p className="m-0 text-base text-foreground">
          Wähle, wie du deine Dokumente verwalten möchtest
        </p>
      </div>

      <FeatureToggle
        isActive={isWolkeMode}
        onToggle={handleToggle}
        label="Wolke-Synchronisation"
        icon={HiFolder}
        description={
          disabled && disabledMessage
            ? disabledMessage
            : isWolkeMode
              ? 'Ganze Ordner werden automatisch synchronisiert und bleiben immer aktuell.'
              : 'Einzelne Dokumente direkt hochladen für maximale Privatsphäre und sofortige Verarbeitung.'
        }
        className={cn('my-md', disabled && 'opacity-50 pointer-events-none')}
        disabled={disabled && isWolkeMode}
      />

      {loading && (
        <div className="mt-md flex items-center justify-center gap-sm rounded-lg bg-background-alt p-md text-sm text-foreground">
          <div className="spinner" />
          <span>Modus wird gewechselt...</span>
        </div>
      )}
    </div>
  );
};

export default DocumentModeSelector;
