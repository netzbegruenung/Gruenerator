/**
 * Plan Questions Component
 * Wrapper around QuestionAnswerSection for Plan Mode context
 * Reuses the production-ready quiz-style UI
 */

import React from 'react';
import QuestionAnswerSection from '../Form/BaseForm/QuestionAnswerSection';
import type { Question } from '@/types/baseform';

export interface PlanQuestionsProps {
  questions: Question[];
  answers: Record<string, string | string[]>;
  onAnswerChange: (questionId: string, value: string | string[]) => void;
  onSubmit: () => void;
  loading?: boolean;
}

const PlanQuestions: React.FC<PlanQuestionsProps> = ({
  questions,
  answers,
  onAnswerChange,
  onSubmit,
  loading = false
}) => {
  return (
    <div className="plan-questions-container">
      <div className="quiz-progress-header">
        <span className="quiz-progress-text">
          💬 Verständnisgespräch
        </span>
      </div>

      <QuestionAnswerSection
        questions={questions}
        answers={answers}
        onAnswerChange={onAnswerChange}
        questionRound={1}
        onSubmit={onSubmit}
        loading={loading}
        submitButtonProps={{
          text: 'Plan aktualisieren',
          loadingText: 'Aktualisiere Plan...'
        }}
      />
    </div>
  );
};

export default PlanQuestions;
