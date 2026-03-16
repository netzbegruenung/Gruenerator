import React, { useState, useEffect, useRef, type ChangeEvent } from 'react';

import { btn } from '../../../../utils/buttonStyles';
import { cn } from '../../../../utils/cn';
import {
  getYesNoEmoji,
  getAnswerOptionEmoji,
  getRoundEmoji,
} from '../../../../utils/questionEmojiMapper';
import SubmitButton from '../../SubmitButton';

import type { Question, QuestionAnswerSectionProps } from '@/types/baseform';

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
      <div
        key={question.id}
        className="mb-lg border-b border-grey-200 pb-md last:border-b-0 last:pb-0 dark:border-grey-700 max-md:mb-md"
      >
        <label className="mb-sm block break-words font-semibold leading-relaxed text-foreground [hyphens:auto] [overflow-wrap:break-word]">
          <span className="mr-xxs inline-block text-[var(--interactive-accent-color)]">
            {index + 1}.
          </span>
          {question.text}
          {question.refersTo && (
            <span className="ml-sm inline-block rounded-xl bg-[var(--klee)] px-2 py-0.5 align-middle text-xs font-medium text-background max-sm:mt-xxs max-sm:ml-0 max-sm:block max-sm:w-fit">
              🔍 Präzisierung
            </span>
          )}
        </label>

        {question.questionFormat === 'yes_no' ? (
          <div className="mt-sm flex gap-md max-md:flex-col max-md:gap-sm">
            {question.options?.map((option) => (
              <button
                key={option}
                type="button"
                className={cn(
                  'flex min-h-[70px] flex-1 cursor-pointer flex-col items-center justify-center gap-xxs rounded-sm border-2 border-transparent bg-hover-alt px-6 py-5 text-center text-base font-normal text-[var(--button-color)] shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all duration-150 hover:shadow-[0_2px_10px_rgba(0,0,0,0.1)] max-md:min-h-[60px] max-md:w-full max-md:px-5 max-md:py-4',
                  questionAnswer === option &&
                    'border-[var(--button-color)] shadow-[0_2px_10px_rgba(0,0,0,0.1)]'
                )}
                onClick={() => handleOptionChange(option)}
              >
                <span className="text-[1.8rem] leading-none max-md:text-2xl">
                  {getYesNoEmoji(option)}
                </span>
                <span className="text-[0.95rem] leading-tight max-md:text-[0.9rem]">{option}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            {(() => {
              const predefinedOptions = question.options || [];
              const optionCount = predefinedOptions.length;

              let gridClass = 'grid-cols-2';
              if (optionCount <= 2) {
                gridClass = 'grid-cols-2';
              } else if (optionCount === 3) {
                gridClass = 'grid-cols-2';
              } else if (optionCount === 4) {
                gridClass = 'grid-cols-2';
              }

              const totalOptions = question.skipOption ? optionCount + 1 : optionCount;

              return (
                <>
                  <div className={cn('mt-md grid gap-sm max-sm:!grid-cols-1', gridClass)}>
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
                          className={cn(
                            'relative flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-xxs rounded-sm border-2 border-transparent bg-hover-alt p-md text-center text-[0.95rem] font-normal leading-snug shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all duration-200 hover:shadow-[0_2px_10px_rgba(0,0,0,0.1)] max-md:min-h-[80px] max-md:p-sm max-sm:min-h-[70px]',
                            isChecked &&
                              'border-[var(--button-color)] shadow-[0_2px_10px_rgba(0,0,0,0.1)]'
                          )}
                          onClick={() => handleOptionChange(option)}
                        >
                          {optionEmoji && (
                            <span className="mb-xxs block text-[2rem] leading-none max-md:text-2xl max-sm:text-[1.3rem]">
                              {optionEmoji}
                            </span>
                          )}
                          <span className="block max-w-full break-words text-[0.9rem] leading-snug [overflow-wrap:break-word] max-md:text-[0.85rem]">
                            {option}
                          </span>
                          {question.allowMultiSelect && <span className="hidden" />}
                        </button>
                      );
                    })}

                    {question.skipOption && (
                      <button
                        type="button"
                        className={cn(
                          'relative flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-xxs rounded-sm border-2 border-transparent bg-hover-alt p-md text-center text-[0.95rem] font-normal leading-snug shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all duration-200 hover:shadow-[0_2px_10px_rgba(0,0,0,0.1)] max-md:min-h-[80px] max-md:p-sm max-sm:min-h-[70px]',
                          optionCount === 3 && 'col-span-full',
                          questionAnswer === question.skipOption.text &&
                            'border-[var(--button-color)] shadow-[0_2px_10px_rgba(0,0,0,0.1)]'
                        )}
                        onClick={() => handleOptionChange(question.skipOption!.text)}
                      >
                        <span className="mb-xxs block text-[2rem] leading-none max-md:text-2xl max-sm:text-[1.3rem]">
                          {question.skipOption.emoji}
                        </span>
                        <span className="block max-w-full break-words text-[0.9rem] leading-snug [overflow-wrap:break-word] max-md:text-[0.85rem]">
                          {question.skipOption.text}
                        </span>
                      </button>
                    )}
                  </div>

                  {question.allowCustom && (
                    <>
                      {!isCustomSelected ? (
                        <button
                          type="button"
                          className="mt-sm flex w-full cursor-pointer items-center justify-center gap-xxs rounded-sm border-2 border-transparent bg-hover-alt p-md text-[0.95rem] font-normal opacity-85 shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all duration-200 hover:shadow-[0_2px_10px_rgba(0,0,0,0.1)] max-md:p-sm max-md:text-[0.9rem]"
                          onClick={() => handleOptionChange(CUSTOM_OPTION_VALUE)}
                        >
                          <span className="text-[1.2rem]">✏️</span>
                          <span>Eigene Antwort eingeben</span>
                        </button>
                      ) : (
                        <div className="relative mt-sm w-full">
                          <textarea
                            ref={handleTextareaRef}
                            className="min-h-[70px] w-full resize-none overflow-hidden rounded-sm border-2 border-[var(--button-color)] bg-hover-alt p-md pr-12 font-inherit text-[0.95rem] leading-normal text-foreground shadow-[0_2px_10px_rgba(0,0,0,0.1)] transition-shadow duration-200 placeholder:italic placeholder:text-grey-400 placeholder:opacity-70 focus:shadow-[0_2px_12px_rgba(0,0,0,0.12)] focus:outline-none max-md:min-h-[60px] max-md:p-sm max-md:pr-[52px] max-md:text-base"
                            value={typeof questionAnswer === 'string' ? questionAnswer : ''}
                            onChange={handleTextareaChange}
                            placeholder={question.placeholder || 'Deine Antwort...'}
                          />
                          <button
                            type="button"
                            className="absolute right-1 top-1 flex h-11 w-11 cursor-pointer items-center justify-center rounded border-none bg-transparent text-2xl leading-none text-foreground transition-all duration-200 hover:bg-[var(--button-color)] hover:text-background"
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
    <div className="my-md p-lg max-md:p-md">
      {questionRound > 1 && (
        <div className="mb-md rounded-sm bg-[var(--button-color)] px-md py-sm text-center font-semibold text-background">
          <span>
            {getRoundEmoji(questionRound)} Vertiefende Fragen (Runde {questionRound}/2)
          </span>
        </div>
      )}

      <div className="mb-lg text-center">
        <div className="mb-sm block text-[0.95rem] font-semibold text-[var(--button-color)]">
          Frage {currentQuestionIndex + 1} von {questions.length}
        </div>
        <div className="h-2 w-full overflow-hidden rounded bg-[var(--input-background)] shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] max-md:h-2.5">
          <div
            className="h-full rounded bg-[var(--button-color)] transition-[width] duration-300"
            style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {renderQuestion(currentQuestion, currentQuestionIndex)}

      <div className="mt-lg flex items-center justify-between gap-md pt-md max-md:flex-col max-md:gap-sm">
        <button
          type="button"
          className={cn(btn.primary, btn.sizeM, 'max-md:min-h-12 max-md:w-full max-md:text-base')}
          onClick={handleBack}
          disabled={currentQuestionIndex === 0}
        >
          ← Zurück
        </button>

        {currentQuestionIndex < questions.length - 1 ? (
          <button
            type="button"
            className={cn(btn.primary, btn.sizeM, 'max-md:min-h-12 max-md:w-full max-md:text-base')}
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
              className={cn(btn.primary, 'max-md:min-h-12 max-md:w-full max-md:text-base')}
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
