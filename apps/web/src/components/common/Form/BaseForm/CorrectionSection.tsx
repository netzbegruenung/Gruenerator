import React, { useState, type ChangeEvent } from 'react';

import SubmitButton from '../../SubmitButton';
import '../../../../assets/styles/components/interactive-antrag.css';

interface CorrectionSectionProps {
  onSubmit: (corrections: string) => void;
  onCancel: () => void;
  loading?: boolean;
  initialValue?: string;
}

const CorrectionSection: React.FC<CorrectionSectionProps> = ({
  onSubmit,
  onCancel,
  loading = false,
  initialValue = '',
}) => {
  const [corrections, setCorrections] = useState(initialValue);

  const handleSubmit = () => {
    if (corrections.trim()) {
      onSubmit(corrections);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="correction-section">
      <div className="correction-header">
        <h3>Plan korrigieren</h3>
        <p className="correction-hint">
          Beschreibe deine gewünschten Änderungen am Plan. Du kannst Aspekte ergänzen, ändern oder
          entfernen lassen.
        </p>
      </div>

      <textarea
        className="correction-textarea"
        value={corrections}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setCorrections(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="z.B. 'Die Kosten sollten auf 50.000€ erhöht werden' oder 'Füge einen Abschnitt über Bürgerbeteiligung hinzu' oder 'Entferne den Teil über Parkplätze'"
        rows={6}
        disabled={loading}
      />

      <p className="correction-shortcut">
        <kbd>⌘</kbd>+<kbd>Enter</kbd> zum Absenden
      </p>

      <div className="correction-actions">
        <button type="button" className="btn-ghost size-m" onClick={onCancel} disabled={loading}>
          Abbrechen
        </button>
        <SubmitButton
          onClick={handleSubmit}
          loading={loading}
          text="Korrekturen anwenden"
          disabled={!corrections.trim() || loading}
        />
      </div>
    </div>
  );
};

export default CorrectionSection;
