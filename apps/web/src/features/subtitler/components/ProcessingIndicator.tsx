import { Button } from '@gruenerator/ui';
import React from 'react';
import { FaTimes } from 'react-icons/fa';

import Spinner from '../../../components/common/Spinner';

interface ProcessingIndicatorProps {
  onCancel?: () => void;
  error?: string | null;
}

const ProcessingIndicator: React.FC<ProcessingIndicatorProps> = ({ onCancel, error }) => {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <div className="flex flex-col items-center gap-lg text-center max-w-[400px]">
        <div className="flex flex-col items-center gap-md">
          {error ? (
            <>
              <div className="flex size-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <FaTimes className="size-6 text-red-600" />
              </div>
              <div className="space-y-xs">
                <h3 className="text-lg font-semibold text-foreground-heading">
                  Fehler bei der Verarbeitung
                </h3>
                <p className="text-foreground">{error}</p>
              </div>
            </>
          ) : (
            <>
              <Spinner size="large" />
              <div className="space-y-xs">
                <h3 className="text-lg font-semibold text-foreground-heading">
                  Video wird verarbeitet...
                </h3>
                <p className="text-foreground">Der Grünerator erstellt jetzt deine Untertitel</p>
              </div>
            </>
          )}
        </div>

        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Verarbeitung abbrechen
          </Button>
        )}
      </div>
    </div>
  );
};

export default ProcessingIndicator;
