import React, { useState, useEffect } from 'react';

import { FormInput } from '../../../../components/common/Form/Input';

interface SharepicData {
  line1?: string;
  line2?: string;
  line3?: string;
  line4?: string;
  line5?: string;
  customCredit?: string;
  creditText?: string;
}

interface EditedLines {
  line1: string;
  line2: string;
  line3: string;
  line4: string;
  line5: string;
  customCredit: string;
}

interface CampaignSharepicEditorProps {
  sharepics: SharepicData[];
  activeIndex: number;
  onEditedLinesChange?: (lines: EditedLines) => void;
  regenerationError?: string | null;
  onClearError?: () => void;
}

/**
 * Editor component for campaign sharepic text
 * Allows editing line1-5 and regenerating the sharepic with new text
 */
const CampaignSharepicEditor = ({
  sharepics,
  activeIndex,
  onEditedLinesChange,
  regenerationError,
  onClearError,
}: CampaignSharepicEditorProps) => {
  // Extract text from active sharepic
  const activeSharepic = sharepics[activeIndex];

  // Local state for edited lines
  const [editedLines, setEditedLines] = useState({
    line1: '',
    line2: '',
    line3: '',
    line4: '',
    line5: '',
    customCredit: '',
  });

  // Update edited lines when active sharepic changes
  useEffect(() => {
    if (activeSharepic) {
      console.log('[CampaignSharepicEditor] Active sharepic:', {
        hasCreditText: !!activeSharepic.creditText,
        creditText: activeSharepic.creditText,
        fullSharepic: activeSharepic,
      });

      setEditedLines({
        line1: activeSharepic.line1 || '',
        line2: activeSharepic.line2 || '',
        line3: activeSharepic.line3 || '',
        line4: activeSharepic.line4 || '',
        line5: activeSharepic.line5 || '',
        customCredit: activeSharepic.customCredit || '',
      });

      // Clear error when switching sharepics
      if (onClearError) {
        onClearError();
      }
    }
  }, [activeIndex, activeSharepic, onClearError]);

  const handleLineChange = (lineNumber: number, value: string) => {
    const newLines = {
      ...editedLines,
      [`line${lineNumber}`]: value,
    };
    setEditedLines(newLines);

    // Notify parent of changes
    if (onEditedLinesChange) {
      onEditedLinesChange(newLines);
    }
  };

  const handleCustomCreditChange = (value: string) => {
    const newLines = {
      ...editedLines,
      customCredit: value,
    };
    setEditedLines(newLines);

    // Notify parent of changes
    if (onEditedLinesChange) {
      onEditedLinesChange(newLines);
    }
  };

  const hasChanges = () => {
    return (Object.keys(editedLines) as Array<keyof EditedLines>).some(
      (key) => editedLines[key] !== (activeSharepic?.[key as keyof SharepicData] || '')
    );
  };

  if (!activeSharepic) {
    return null;
  }

  return (
    <div className="mt-md rounded-md border border-grey-200 bg-background-alt p-md dark:border-grey-700 max-md:p-sm">
      <div className="mb-md">
        <h3 className="m-0 mb-xs text-lg font-semibold text-foreground max-md:text-base">Sharepic bearbeiten</h3>
        <p className="m-0 text-sm text-grey-400">Bearbeite den Text des Sharepics und generiere es neu</p>
      </div>

      <div className="flex flex-col gap-md">
        <div className="flex flex-col gap-sm">
          {([1, 2, 3, 4, 5] as const).map((lineNum) => (
            <div key={lineNum} className="w-full">
              <FormInput
                name={`line${lineNum}`}
                label={`Zeile ${lineNum}`}
                value={editedLines[`line${lineNum}` as keyof EditedLines]}
                onChange={(value: string) => handleLineChange(lineNum, value)}
                placeholder={`Zeile ${lineNum} des Gedichts...`}
                maxLength={60}
              />
            </div>
          ))}

          {activeSharepic.creditText && (
            <div className="w-full">
              <label className="form-label">Aktueller Credit-Text</label>
              <div className="current-credit-display">{activeSharepic.creditText}</div>
            </div>
          )}

          <div className="w-full">
            <FormInput
              name="customCredit"
              label="Neuer Credit-Text (optional)"
              value={editedLines.customCredit}
              onChange={(value: string) => handleCustomCreditChange(value)}
              placeholder="z.B. Grüne Berlin · gruene-hamburg.de"
              helpText="Leer lassen um aktuellen Text zu behalten"
            />
          </div>
        </div>

        {regenerationError && (
          <div className="flex items-center gap-sm rounded-sm border border-red-300 bg-red-500/10 px-md py-sm text-red-600 dark:text-red-400">
            <span className="shrink-0 text-lg">⚠️</span>
            <span className="flex-1 text-sm">{regenerationError}</span>
          </div>
        )}
      </div>
    </div>
  );
};

CampaignSharepicEditor.defaultProps = {
  onEditedLinesChange: null,
  regenerationError: null,
  onClearError: null,
};

export default CampaignSharepicEditor;
