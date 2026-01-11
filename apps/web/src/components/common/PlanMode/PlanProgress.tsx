/**
 * Plan Progress Component
 * Shows progress through Plan Mode phases using quiz-style progress bar
 */

import React from 'react';

export interface PlanProgressProps {
  currentPhase: string;
  hasQuestions: boolean;
  hasRevision: boolean;
}

const PlanProgress: React.FC<PlanProgressProps> = ({
  currentPhase,
  hasQuestions,
  hasRevision
}) => {
  // Calculate progress percentage
  const getProgressPercentage = (): number => {
    const phases = ['idle', 'plan', 'questions', 'revised', 'approval', 'generating', 'completed'];
    const currentIndex = phases.indexOf(currentPhase);

    if (currentIndex === -1) return 0;

    // Skip questions phase if not needed
    if (!hasQuestions && currentIndex > phases.indexOf('plan')) {
      // Adjust: plan(20%) -> approval(60%) -> generating(80%) -> completed(100%)
      if (currentPhase === 'approval') return 60;
      if (currentPhase === 'generating') return 80;
      if (currentPhase === 'completed') return 100;
    }

    // Full flow: plan(20%) -> questions(40%) -> revised(60%) -> approval(70%) -> generating(85%) -> completed(100%)
    if (hasQuestions) {
      switch (currentPhase) {
        case 'plan': return 20;
        case 'questions': return 40;
        case 'revised': return 60;
        case 'approval': return 70;
        case 'generating': return 85;
        case 'completed': return 100;
        default: return 0;
      }
    }

    // Default linear progress
    return Math.min((currentIndex / (phases.length - 1)) * 100, 100);
  };

  const getPhaseLabel = (): string => {
    switch (currentPhase) {
      case 'idle': return 'Initialisierung...';
      case 'plan': return 'Plan wird erstellt';
      case 'questions': return 'Verständnisgespräch';
      case 'revised': return 'Plan überarbeitet';
      case 'approval': return 'Genehmigung';
      case 'generating': return 'Content wird generiert';
      case 'completed': return 'Abgeschlossen';
      default: return 'Plan-Modus';
    }
  };

  if (currentPhase === 'idle' || currentPhase === 'completed') {
    return null; // Don't show progress for initial or final state
  }

  const progressPercent = getProgressPercentage();

  return (
    <div className="plan-progress-container quiz-progress-header">
      <span className="quiz-progress-text">
        {getPhaseLabel()} ({Math.round(progressPercent)}%)
      </span>
      <div className="quiz-progress-bar-container">
        <div
          className="quiz-progress-bar-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
};

export default PlanProgress;
