import React, { useState, useEffect } from 'react';
import { FormInput } from '../../../../components/common/Form/Input';
import './campaign-sharepic-editor.css';

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
  onClearError
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
    customCredit: ''
  });

  // Update edited lines when active sharepic changes
  useEffect(() => {
    if (activeSharepic) {
      console.log('[CampaignSharepicEditor] Active sharepic:', {
        hasCreditText: !!activeSharepic.creditText,
        creditText: activeSharepic.creditText,
        fullSharepic: activeSharepic
      });

      setEditedLines({
        line1: activeSharepic.line1 || '',
        line2: activeSharepic.line2 || '',
        line3: activeSharepic.line3 || '',
        line4: activeSharepic.line4 || '',
        line5: activeSharepic.line5 || '',
        customCredit: activeSharepic.customCredit || ''
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
      [`line${lineNumber}`]: value
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
      customCredit: value
    };
    setEditedLines(newLines);

    // Notify parent of changes
    if (onEditedLinesChange) {
      onEditedLinesChange(newLines);
    }
  };

  const hasChanges = () => {
    return (Object.keys(editedLines) as Array<keyof EditedLines>).some(key =>
      editedLines[key] !== (activeSharepic?.[key as keyof SharepicData] || '')
    );
  };

  if (!activeSharepic) {
    return null;
  }

  return (
    <div className="campaign-sharepic-editor">
      <div className="editor-header">
        <h3 className="editor-title">Sharepic bearbeiten</h3>
        <p className="editor-subtitle">
          Bearbeite den Text des Sharepics und generiere es neu
        </p>
      </div>

      <div className="editor-content">
        <div className="editor-form">
          {([1, 2, 3, 4, 5] as const).map(lineNum => (
            <div key={lineNum} className="editor-field">
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
            <div className="editor-field">
              <label className="form-label">Aktueller Credit-Text</label>
              <div className="current-credit-display">
                {activeSharepic.creditText}
              </div>
            </div>
          )}

          <div className="editor-field">
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
          <div className="editor-error">
            <span className="error-icon">⚠️</span>
            <span className="error-text">{regenerationError}</span>
          </div>
        )}
      </div>
    </div>
  );
};

CampaignSharepicEditor.defaultProps = {
  onEditedLinesChange: null,
  regenerationError: null,
  onClearError: null
};

export default CampaignSharepicEditor;
