import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../../../../assets/styles/components/interactive-antrag.css';

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
  questionRound
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
          <span>Vertiefende Fragen (Runde {questionRound}/2)</span>
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
                  Präzisierung
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
                    {option}
                  </button>
                ))}
              </div>
            ) : (
              <>
                {/* Radio/Checkbox buttons for multiple choice questions */}
                <div className="question-options">
                  {question.options?.map(option => {
                    const isChecked = question.allowMultiSelect
                      ? (Array.isArray(currentAnswer) && currentAnswer.includes(option))
                      : (!isCustomSelected && currentAnswer === option);

                    return (
                      <label key={option} className="question-option">
                        <input
                          type={question.allowMultiSelect ? "checkbox" : "radio"}
                          name={question.id}
                          value={option}
                          checked={isChecked}
                          onChange={(e) => handleOptionChange(e.target.value)}
                          className="question-radio"
                        />
                        <span className="question-option-text">{option}</span>
                      </label>
                    );
                  })}

                  {/* Custom input option (only if allowCustom is true) */}
                  {question.allowCustom && (
                    <label className="question-option question-option-custom">
                      <input
                        type="radio"
                        name={question.id}
                        value={CUSTOM_OPTION_VALUE}
                        checked={isCustomSelected}
                        onChange={(e) => handleOptionChange(e.target.value)}
                        className="question-radio"
                      />
                      <span className="question-option-text">Eigene Antwort eingeben</span>
                    </label>
                  )}
                </div>
              </>
            )}

            {/* Expanding custom input section */}
            {question.allowCustom && isCustomSelected && (
              <div className="question-custom-input-wrapper">
                <textarea
                  className="question-custom-textarea"
                  value={currentAnswer}
                  onChange={(e) => handleCustomTextChange(e.target.value)}
                  placeholder={question.placeholder || 'Deine Antwort...'}
                  rows={3}
                  autoFocus
                />
              </div>
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
          <div className="quiz-completion-hint">
            {allAnswered ? (
              <span className="quiz-ready-text">✓ Alle Fragen beantwortet – Klicke auf "Fragen beantworten"</span>
            ) : (
              <span className="quiz-not-ready-text">Bitte beantworte diese Frage, um fortzufahren.</span>
            )}
          </div>
        )}
      </div>

      {/* Overall progress indicator */}
      <div className="question-progress">
        <span className="question-progress-text">
          {Object.keys(answers).length} von {questions.length} Fragen beantwortet
        </span>
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
    allowCustom: PropTypes.bool,
    allowMultiSelect: PropTypes.bool,
    placeholder: PropTypes.string,
    refersTo: PropTypes.string
  })).isRequired,
  answers: PropTypes.object.isRequired,
  onAnswerChange: PropTypes.func.isRequired,
  questionRound: PropTypes.number
};

QuestionAnswerSection.defaultProps = {
  questionRound: 1
};

export default QuestionAnswerSection;
