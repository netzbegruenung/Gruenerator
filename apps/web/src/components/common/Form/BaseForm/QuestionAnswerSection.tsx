import React, { useState, useEffect, useRef, type ChangeEvent } from 'react';

import SubmitButton from '../../SubmitButton';

import type { Question, QuestionAnswerSectionProps } from '@/types/baseform';

import '../../../../assets/styles/components/interactive-antrag.css';
import {
  getYesNoEmoji,
  getAnswerOptionEmoji,
  getRoundEmoji,
} from '../../../../utils/questionEmojiMapper';

const CUSTOM_OPTION_VALUE = '__custom__';

type AnswerValue = string | string[];
type CustomSelectionsState = Record<string, boolean>;

const QuestionAnswerSection: React.FC<QuestionAnswerSectionProps> = ({
  questions = [],
  answers = {},
  onAnswerChange,
  questionRound = 1,
  onSubmit,
  loading = false,
  success = false,
  submitButtonProps = {},
  hideSubmitButton = false,
}) => {
  const [customSelections, setCustomSelections] = useState<CustomSelectionsState>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  useEffect(() => {
    setCurrentQuestionIndex(0);
  }, [questions]);

  const allAnswered = questions.every((q) => {
    const answer = answers[q.id];
    const hasCustom = customSelections[q.id];

    if (hasCustom) {
      return typeof answer === 'string' && answer.trim().length > 0;
    }

    if (Array.isArray(answer)) {
      return answer.length > 0;
    }
    return typeof answer === 'string' && answer.trim().length > 0;
  });

  const currentQuestion = questions[currentQuestionIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : null;
  const isCurrentQuestionAnswered = Array.isArray(currentAnswer)
    ? currentAnswer.length > 0
    : typeof currentAnswer === 'string' && currentAnswer.trim().length > 0;

  const handleNext = (): void => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  const handleBack = (): void => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  };

  if (!currentQuestion) {
    return null;
  }

  const renderQuestion = (question: Question, index: number): React.ReactNode => {
    const isCustomSelected = customSelections[question.id];
    const questionAnswer = answers[question.id] || '';

    const handleOptionChange = (value: string): void => {
      if (!onAnswerChange) return;

      if (value === CUSTOM_OPTION_VALUE) {
        setCustomSelections({ ...customSelections, [question.id]: true });
        onAnswerChange(question.id, '');
      } else {
        setCustomSelections({ ...customSelections, [question.id]: false });

        if (question.allowMultiSelect) {
          const currentAnswers = Array.isArray(questionAnswer) ? questionAnswer : [];
          const newAnswers = currentAnswers.includes(value)
            ? currentAnswers.filter((a) => a !== value)
            : [...currentAnswers, value];
          onAnswerChange(question.id, newAnswers);
        } else {
          onAnswerChange(question.id, value);
        }
      }
    };

    const handleCustomTextChange = (value: string): void => {
      onAnswerChange?.(question.id, value);
    };

    const handleTextareaRef = (el: HTMLTextAreaElement | null): void => {
      if (el) {
        el.style.height = 'auto';
        el.style.height = Math.max(70, el.scrollHeight) + 'px';
      }
    };

    const handleTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
      handleCustomTextChange(e.target.value);
      e.target.style.height = 'auto';
      e.target.style.height = Math.max(70, e.target.scrollHeight) + 'px';
    };

    return (
      <div key={question.id} className="question-item quiz-question-card">
        <label className="question-label">
          <span className="question-number">{index + 1}.</span>
          {question.text}
          {question.refersTo && (
            <span className="question-clarification-badge">🔍 Präzisierung</span>
          )}
        </label>

        {question.questionFormat === 'yes_no' ? (
          <div className="yes-no-buttons">
            {question.options?.map((option) => (
              <button
                key={option}
                type="button"
                className={`yes-no-button ${questionAnswer === option ? 'selected' : ''}`}
                onClick={() => handleOptionChange(option)}
              >
                <span className="yes-no-emoji">{getYesNoEmoji(option)}</span>
                <span className="yes-no-text">{option}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            {(() => {
              const predefinedOptions = question.options || [];
              const optionCount = predefinedOptions.length;

              let gridClass = 'quiz-grid-2x2';
              if (optionCount <= 2) {
                gridClass = 'quiz-grid-horizontal';
              } else if (optionCount === 3) {
                gridClass = 'quiz-grid-3';
              } else if (optionCount === 4) {
                gridClass = 'quiz-grid-4';
              }

              const totalOptions = question.skipOption ? optionCount + 1 : optionCount;
              if (totalOptions === 4) {
                gridClass = 'quiz-grid-4';
              }

              return (
                <>
                  <div className={`question-options-grid ${gridClass}`}>
                    {predefinedOptions.map((option, optionIndex) => {
                      const isChecked = question.allowMultiSelect
                        ? Array.isArray(questionAnswer) && questionAnswer.includes(option)
                        : !isCustomSelected && questionAnswer === option;

                      const optionEmoji =
                        (question.optionEmojis && question.optionEmojis[optionIndex]) ||
                        getAnswerOptionEmoji(question.type, option);

                      return (
                        <button
                          key={option}
                          type="button"
                          className={`quiz-option-button ${isChecked ? 'selected' : ''}`}
                          onClick={() => handleOptionChange(option)}
                        >
                          {optionEmoji && <span className="option-emoji">{optionEmoji}</span>}
                          <span className="option-text">{option}</span>
                          {question.allowMultiSelect && <span className="checkbox-indicator" />}
                        </button>
                      );
                    })}

                    {question.skipOption && (
                      <button
                        type="button"
                        className={`quiz-option-button ${questionAnswer === question.skipOption.text ? 'selected' : ''}`}
                        onClick={() => handleOptionChange(question.skipOption!.text)}
                      >
                        <span className="option-emoji">{question.skipOption.emoji}</span>
                        <span className="option-text">{question.skipOption.text}</span>
                      </button>
                    )}
                  </div>

                  {question.allowCustom && (
                    <>
                      {!isCustomSelected ? (
                        <button
                          type="button"
                          className="quiz-option-custom"
                          onClick={() => handleOptionChange(CUSTOM_OPTION_VALUE)}
                        >
                          <span className="custom-icon">✏️</span>
                          <span>Eigene Antwort eingeben</span>
                        </button>
                      ) : (
                        <div className="quiz-option-custom-input-container">
                          <textarea
                            ref={handleTextareaRef}
                            className="quiz-option-custom-textarea"
                            value={typeof questionAnswer === 'string' ? questionAnswer : ''}
                            onChange={handleTextareaChange}
                            placeholder={question.placeholder || 'Deine Antwort...'}
                          />
                          <button
                            type="button"
                            className="custom-input-close"
                            onClick={() => {
                              setCustomSelections({ ...customSelections, [question.id]: false });
                              onAnswerChange?.(question.id, '');
                            }}
                            aria-label="Schließen"
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="question-answer-section quiz-mode">
      {questionRound > 1 && (
        <div className="question-round-indicator">
          <span>
            {getRoundEmoji(questionRound)} Vertiefende Fragen (Runde {questionRound}/2)
          </span>
        </div>
      )}

      <div className="quiz-progress-header">
        <div className="quiz-progress-text">
          Frage {currentQuestionIndex + 1} von {questions.length}
        </div>
        <div className="quiz-progress-bar-container">
          <div
            className="quiz-progress-bar-fill"
            style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {renderQuestion(currentQuestion, currentQuestionIndex)}

      <div className="quiz-navigation">
        <button
          type="button"
          className="btn-primary size-m"
          onClick={handleBack}
          disabled={currentQuestionIndex === 0}
        >
          ← Zurück
        </button>

        {currentQuestionIndex < questions.length - 1 ? (
          <button
            type="button"
            className="btn-primary size-m"
            onClick={handleNext}
            disabled={!isCurrentQuestionAnswered}
          >
            Weiter →
          </button>
        ) : (
          !hideSubmitButton && (
            <SubmitButton
              onClick={onSubmit}
              loading={loading}
              success={success}
              text={
                (submitButtonProps as Record<string, string>)?.defaultText || 'Fragen beantworten'
              }
              className="quiz-submit-button button-primary"
              ariaLabel="Fragen beantworten"
              type="submit"
              {...submitButtonProps}
            />
          )
        )}
      </div>
    </div>
  );
};

QuestionAnswerSection.displayName = 'QuestionAnswerSection';

export default QuestionAnswerSection;
