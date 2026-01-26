import { HiFolder } from 'react-icons/hi';

import FeatureToggle from '../../../components/common/FeatureToggle';

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
    <div className="document-mode-selector">
      <div className="document-mode-selector-header">
        <h3>Dokumenten-Verwaltung</h3>
        <p className="document-mode-selector-description">
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
        className={`document-mode-feature-toggle ${disabled ? 'disabled' : ''}`}
        disabled={disabled && isWolkeMode}
      />

      {loading && (
        <div className="document-mode-loading">
          <div className="spinner" />
          <span>Modus wird gewechselt...</span>
        </div>
      )}
    </div>
  );
};

export default DocumentModeSelector;
