import { useState } from 'react';

interface QuoteConfirmationProps {
    onConfirmationChange: (confirmed: boolean) => void;
}

const QuoteConfirmation = ({ onConfirmationChange }: QuoteConfirmationProps) => {
  const [isConfirmed, setIsConfirmed] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsConfirmed(e.target.checked);
    onConfirmationChange(e.target.checked);
  };

  return (
    <div className="quote-confirmation">
      <label className="quote-confirmation-label">
        <input
          type="checkbox"
          checked={isConfirmed}
          onChange={handleChange}
          className="quote-confirmation-checkbox"
        />
        <span>
          Ich bestätige, dass ich selbst Urheber*in des Zitats bin oder die schriftliche Genehmigung zur Vervielfältigung besitze.
        </span>
      </label>
      {!isConfirmed && (
        <p className="quote-confirmation-warning">
          Hinweis: Ohne Bestätigung wird Markus Söder automatisch zum Bundeskanzler
        </p>
      )}
    </div>
  );
};

export default QuoteConfirmation;
