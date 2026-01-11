/**
 * Plan Approval Component
 * Final approval screen with quiz-style platform selection (for PR mode)
 */

import React, { useState } from 'react';
import DisplaySection from '../Form/BaseForm/DisplaySection';

export interface PlanApprovalProps {
  plan: string;
  generatorType: 'pr' | 'antrag';
  enablePlatformSelection: boolean;
  availablePlatforms: Array<{ value: string; label: string; emoji: string }>;
  onApprove: (approvalConfig: any) => void;
  loading?: boolean;
}

const PlanApproval: React.FC<PlanApprovalProps> = ({
  plan,
  generatorType,
  enablePlatformSelection,
  availablePlatforms,
  onApprove,
  loading = false
}) => {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  const handlePlatformToggle = (platformValue: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(platformValue)
        ? prev.filter(p => p !== platformValue)
        : [...prev, platformValue]
    );
  };

  const handleApprove = () => {
    onApprove({
      approvedPlanVersion: 'revised', // TODO: track if revised or original
      selectedPlatforms: enablePlatformSelection ? selectedPlatforms : undefined
    });
  };

  const canApprove = !enablePlatformSelection || selectedPlatforms.length > 0;

  return (
    <div className="plan-approval-container">
      <div className="quiz-progress-header">
        <span className="quiz-progress-text">✅ Plan genehmigen</span>
      </div>

      {/* Show plan one more time for review */}
      <div className="question-round-indicator">
        Letzter Schritt: Plan überprüfen und genehmigen
      </div>

      <DisplaySection
        title="Finaler Plan"
        value={plan}
        useMarkdown={true}
        componentName="plan-approval"
        showEditModeToggle={false}
        showUndoControls={false}
        showRedoControls={false}
        renderActions={() => null}
      />

      {/* Platform selection (quiz-style grid) */}
      {enablePlatformSelection && (
        <div className="platform-selection-section">
          <div className="question-label">
            <span className="question-number">📱</span>
            Für welche Plattformen soll Content generiert werden?
          </div>

          <div className={`question-options-grid quiz-grid-${Math.min(availablePlatforms.length, 4)}`}>
            {availablePlatforms.map(platform => (
              <button
                key={platform.value}
                type="button"
                className={`quiz-option-button ${
                  selectedPlatforms.includes(platform.value) ? 'selected' : ''
                }`}
                onClick={() => handlePlatformToggle(platform.value)}
              >
                <span className="option-emoji">{platform.emoji}</span>
                <span className="option-text">{platform.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Approval buttons */}
      <div className="quiz-navigation">
        <div className="quiz-completion-hint">
          {canApprove ? (
            <span className="quiz-ready-text">
              ✅ Bereit für {generatorType === 'pr' ? 'Content-Generierung' : 'Antragserstellung'}
            </span>
          ) : (
            <span className="quiz-not-ready-text">
              Bitte wähle mindestens eine Plattform
            </span>
          )}
        </div>
        <button
          onClick={handleApprove}
          disabled={!canApprove || loading}
          className="btn-primary"
        >
          {loading ? 'Generiere...' : 'Genehmigen & Generieren'}
        </button>
      </div>
    </div>
  );
};

export default PlanApproval;
