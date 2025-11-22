import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import SubmitButton from '../../SubmitButton';
import '../../../../assets/styles/components/interactive-antrag.css';
import {
  getYesNoEmoji,
  getAnswerOptionEmoji,
  getRoundEmoji,
  getProgressEmoji
} from '../../../../utils/questionEmojiMapper';

/**
 * QuestionAnswerSection Component
 *
 * Renders questions one at a time in a quiz-style interface.
 * All questions now have 2 predefined options + custom input option.
 */
const QuestionAnswerSection = ({
  questions,
  answers,
  onAnswerChange,
  questionRound,
  onSubmit,
  loading,
  success,
  submitButtonProps
}) => {
  const CUSTOM_OPTION_VALUE = '__custom__';

  // Track which questions have "custom" option selected
  const [customSelections, setCustomSelections] = useState({});

  // Track current question index for quiz-style display
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Reset to first question when questions change (e.g., new round)
  useEffect(() => {
    setCurrentQuestionIndex(0);
  }, [questions]);

  // Check if all questions have been answered
  const allAnswered = questions.every(q => {
    const answer = answers[q.id];
    const hasCustom = customSelections[q.id];

    // If custom is selected, check if custom text is provided
    if (hasCustom) {
      return answer && answer.trim().length > 0;
    }

    // Check if answer is provided (array or string)
    if (Array.isArray(answer)) {
      return answer.length > 0; // At least one option selected for multi-select
    }
    return answer && answer.trim().length > 0;
  });

  // Check if current question is answered
  const currentQuestion = questions[currentQuestionIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : null;
  const isCurrentQuestionAnswered = Array.isArray(currentAnswer)
    ? currentAnswer.length > 0
    : (currentAnswer && currentAnswer.trim().length > 0);

  // Navigation handlers
  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  if (!currentQuestion) {
    return null;
  }

  return (
    <div className="question-answer-section quiz-mode">
      {/* Round indicator for follow-up questions */}
      {questionRound > 1 && (
        <div className="question-round-indicator">
          <span>{getRoundEmoji(questionRound)} Vertiefende Fragen (Runde {questionRound}/2)</span>
        </div>
      )}

      {/* Progress indicator */}
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

      {/* Render current question only */}
      {(() => {
        const question = currentQuestion;
        const index = currentQuestionIndex;
        const isCustomSelected = customSelections[question.id];
        const currentAnswer = answers[question.id] || '';

        const handleOptionChange = (value) => {
          if (value === CUSTOM_OPTION_VALUE) {
            // User selected "Eigene Antwort"
            setCustomSelections({ ...customSelections, [question.id]: true });
            onAnswerChange(question.id, '');
          } else {
            // User selected a predefined option
            setCustomSelections({ ...customSelections, [question.id]: false });

            // Multi-select: toggle option in array
            if (question.allowMultiSelect) {
              const currentAnswers = Array.isArray(currentAnswer) ? currentAnswer : [];
              const newAnswers = currentAnswers.includes(value)
                ? currentAnswers.filter(a => a !== value) // Remove if already selected
                : [...currentAnswers, value]; // Add if not selected
              onAnswerChange(question.id, newAnswers);
            } else {
              // Single-select: replace value
              onAnswerChange(question.id, value);
            }
          }
        };

        const handleCustomTextChange = (value) => {
          onAnswerChange(question.id, value);
        };

        return (
          <div key={question.id} className="question-item quiz-question-card">
            <label className="question-label">
              <span className="question-number">{index + 1}.</span>
              {question.text}
              {question.refersTo && (
                <span className="question-clarification-badge">
                  🔍 Präzisierung
                </span>
              )}
            </label>

            {/* Yes/No buttons for binary questions */}
            {question.questionFormat === 'yes_no' ? (
              <div className="yes-no-buttons">
                {question.options?.map(option => (
                  <button
                    key={option}
                    type="button"
                    className={`yes-no-button ${currentAnswer === option ? 'selected' : ''}`}
                    onClick={() => handleOptionChange(option)}
                  >
                    <span className="yes-no-emoji">{getYesNoEmoji(option)}</span>
                    <span className="yes-no-text">{option}</span>
                  </button>
                ))}
              </div>
            ) : (
              <>
                {/* Quizduell-style grid layout for multiple choice questions */}
                {(() => {
                  const predefinedOptions = question.options || [];
                  const optionCount = predefinedOptions.length;

                  // Determine grid layout class
                  let gridClass = 'quiz-grid-2x2'; // Default for 3-4 options
                  if (optionCount <= 2) {
                    gridClass = 'quiz-grid-horizontal';
                  } else if (optionCount === 3) {
                    gridClass = 'quiz-grid-3';
                  }

                  return (
                    <>
                      <div className={`question-options-grid ${gridClass}`}>
                        {predefinedOptions.map((option, optionIndex) => {
                          const isChecked = question.allowMultiSelect
                            ? (Array.isArray(currentAnswer) && currentAnswer.includes(option))
                            : (!isCustomSelected && currentAnswer === option);

                          // Use AI-provided emoji if available, otherwise fallback to mapper
                          const optionEmoji = (question.optionEmojis && question.optionEmojis[optionIndex])
                            || getAnswerOptionEmoji(question.type, option);

                          return (
                            <button
                              key={option}
                              type="button"
                              className={`quiz-option-button ${isChecked ? 'selected' : ''}`}
                              onClick={() => handleOptionChange(option)}
                            >
                              {optionEmoji && <span className="option-emoji">{optionEmoji}</span>}
                              <span className="option-text">{option}</span>
                              {question.allowMultiSelect && (
                                <span className="checkbox-indicator" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Custom input option - transforms into textarea when clicked */}
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
                                ref={(el) => {
                                  if (el) {
                                    el.style.height = 'auto';
                                    el.style.height = Math.max(70, el.scrollHeight) + 'px';
                                  }
                                }}
                                className="quiz-option-custom-textarea"
                                value={currentAnswer}
                                onChange={(e) => {
                                  handleCustomTextChange(e.target.value);
                                  e.target.style.height = 'auto';
                                  e.target.style.height = Math.max(70, e.target.scrollHeight) + 'px';
                                }}
                                placeholder={question.placeholder || 'Deine Antwort...'}
                                autoFocus
                              />
                              <button
                                type="button"
                                className="custom-input-close"
                                onClick={() => {
                                  setCustomSelections({ ...customSelections, [question.id]: false });
                                  onAnswerChange(question.id, '');
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
      })()}

      {/* Navigation buttons */}
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
          <SubmitButton
            onClick={onSubmit}
            loading={loading}
            success={success}
            text={submitButtonProps?.defaultText || "Fragen beantworten"}
            className="quiz-submit-button button-primary"
            ariaLabel="Fragen beantworten"
            type="submit"
            {...submitButtonProps}
          />
        )}
      </div>
    </div>
  );
};

QuestionAnswerSection.propTypes = {
  questions: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    questionFormat: PropTypes.oneOf(['yes_no', 'multiple_choice']),
    options: PropTypes.arrayOf(PropTypes.string).isRequired,
    optionEmojis: PropTypes.arrayOf(PropTypes.string),
    allowCustom: PropTypes.bool,
    allowMultiSelect: PropTypes.bool,
    placeholder: PropTypes.string,
    refersTo: PropTypes.string
  })).isRequired,
  answers: PropTypes.object.isRequired,
  onAnswerChange: PropTypes.func.isRequired,
  questionRound: PropTypes.number,
  onSubmit: PropTypes.func,
  loading: PropTypes.bool,
  success: PropTypes.bool,
  submitButtonProps: PropTypes.object
};

QuestionAnswerSection.defaultProps = {
  questionRound: 1,
  onSubmit: null,
  loading: false,
  success: false,
  submitButtonProps: {}
};

export default QuestionAnswerSection;
