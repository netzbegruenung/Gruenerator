import React, { useState, type ChangeEvent } from 'react';

import { btn } from '../../../../utils/buttonStyles';
import { cn } from '../../../../utils/cn';
import SubmitButton from '../../SubmitButton';

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
    <div className="p-lg max-md:p-md">
      <div>
        <h3 className="mb-sm font-semibold text-foreground">Plan korrigieren</h3>
        <p className="mb-md text-[0.9rem] leading-relaxed text-grey-500 dark:text-grey-400">
          Beschreibe deine gewünschten Änderungen am Plan. Du kannst Aspekte ergänzen, ändern oder
          entfernen lassen.
        </p>
      </div>

      <textarea
        className="min-h-[150px] w-full resize-y rounded-sm border-2 border-transparent bg-hover-alt p-md font-inherit text-[0.95rem] leading-relaxed text-foreground transition-colors duration-200 placeholder:italic placeholder:text-grey-400 placeholder:opacity-70 focus:border-[var(--button-color)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 max-md:min-h-[120px] max-md:text-base"
        value={corrections}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setCorrections(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="z.B. 'Die Kosten sollten auf 50.000€ erhöht werden' oder 'Füge einen Abschnitt über Bürgerbeteiligung hinzu' oder 'Entferne den Teil über Parkplätze'"
        rows={6}
        disabled={loading}
      />

      <p className="mt-sm text-[0.8rem] text-grey-500 opacity-75 dark:text-grey-400 max-md:hidden">
        <kbd className="rounded bg-hover-alt px-1.5 py-0.5 font-inherit text-xs">⌘</kbd>+
        <kbd className="rounded bg-hover-alt px-1.5 py-0.5 font-inherit text-xs">Enter</kbd> zum
        Absenden
      </p>

      <div className="mt-md flex justify-end gap-md max-md:flex-col">
        <button
          type="button"
          className={cn(btn.ghost, btn.sizeM, 'max-md:w-full')}
          onClick={onCancel}
          disabled={loading}
        >
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
