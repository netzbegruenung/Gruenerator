import { type JSX, type ReactNode } from 'react';
import { FaStop } from 'react-icons/fa';
import { HiArrowUp, HiMagnifyingGlass } from 'react-icons/hi2';

import Icon from '@/components/common/Icon';
import { cn } from '@/utils/cn';

const defaultExampleQuestions = [
  {
    icon: '🚲',
    text: 'Verkehrswende in Kommunen Beispiele',
  },
  {
    icon: '🌍',
    text: 'Klimaschutz für Kommunen Ideen',
  },
];

interface SearchBarProps {
  onSearch: (query?: string) => void;
  loading?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  exampleQuestions?: {
    icon?: string;
    text?: string;
  }[];
  onDeepResearchToggle?: () => void;
  isDeepResearchActive?: boolean;
  hideExamples?: boolean;
  hideDisclaimer?: boolean;
  settingsContent?: ReactNode;
  /** When provided, replaces the example questions in the bottom tray */
  bottomContent?: ReactNode;
  /** Where to render the submit button: 'inline' next to input (default), 'tray' in the bottom tray right-aligned, 'hidden' to hide entirely (e.g. live search) */
  submitPlacement?: 'inline' | 'tray' | 'hidden';
  isStreaming?: boolean;
  onAbort?: () => void;
  /**
   * Visual variant. 'default' = solid border, transparent submit button.
   * 'composer' = elevated card with shadow + round primary submit button,
   * mirroring the look of `<GrueneratorComposer>` used at /chat.
   */
  variant?: 'default' | 'composer';
}

const SearchBar = ({
  onSearch,
  loading,
  value,
  onChange,
  placeholder = 'Suchbegriff eingeben...',
  exampleQuestions = defaultExampleQuestions,
  onDeepResearchToggle,
  isDeepResearchActive = false,
  hideExamples = false,
  hideDisclaimer = false,
  settingsContent = null,
  bottomContent = null,
  submitPlacement = 'inline',
  isStreaming = false,
  onAbort,
  variant = 'default',
}: SearchBarProps): JSX.Element => {
  const isComposer = variant === 'composer';
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (value?.trim() && !loading) {
      onSearch(value.trim());
    }
  };

  const submitButton =
    submitPlacement !== 'hidden' ? (
      isStreaming ? (
        <button
          type="button"
          className={cn(
            'flex items-center justify-center transition-colors duration-200',
            isComposer
              ? 'm-2 size-8 rounded-full bg-error text-white hover:bg-error/90'
              : cn(
                  'border-none bg-transparent p-0 text-red-600 hover:text-red-700',
                  submitPlacement === 'inline' ? 'size-12' : 'size-8'
                )
          )}
          onClick={onAbort}
          aria-label="Suche abbrechen"
          title="Suche abbrechen"
        >
          <FaStop className={isComposer ? 'size-4' : 'size-[18px]'} />
        </button>
      ) : (
        <button
          type="submit"
          className={cn(
            'flex items-center justify-center transition-opacity duration-200 disabled:cursor-not-allowed',
            isComposer
              ? cn(
                  'm-2 size-8 rounded-full bg-primary text-white hover:bg-primary/90',
                  'disabled:opacity-30'
                )
              : cn(
                  'border-none bg-transparent p-0 transition-colors hover:text-primary-500 disabled:text-grey-400',
                  submitPlacement === 'inline'
                    ? 'size-12 text-foreground'
                    : 'size-8 text-foreground/70'
                )
          )}
          disabled={loading || !value?.trim()}
          aria-label="Suchen"
        >
          {loading ? (
            <div
              className={cn(
                'animate-spin rounded-full border-2',
                isComposer
                  ? 'size-4 border-white/40 border-t-white'
                  : 'size-[18px] border-background-alt border-t-primary-500'
              )}
            />
          ) : isComposer ? (
            <HiArrowUp className="size-5" />
          ) : (
            <HiMagnifyingGlass className="size-[18px]" />
          )}
        </button>
      )
    ) : null;

  const showExamples =
    !bottomContent && !hideExamples && exampleQuestions && exampleQuestions.length > 0;
  const trayContent =
    bottomContent ||
    (showExamples ? (
      <div className="flex flex-wrap items-center gap-xs max-md:flex-col max-md:items-stretch">
        {exampleQuestions.map((question, index) => (
          <button
            key={index}
            type="button"
            className="flex items-center gap-1.5 rounded-full border border-grey-200 bg-background-alt px-3 py-1 text-xs text-foreground/70 transition-colors duration-150 hover:border-primary-500 hover:text-primary-600 dark:border-grey-700 max-md:justify-center"
            onClick={() => question.text && onChange?.(question.text)}
          >
            <span>{question.icon}</span>
            <span>{question.text}</span>
          </button>
        ))}
      </div>
    ) : null);

  const trayWithSubmit =
    submitPlacement === 'tray' && trayContent && submitButton ? (
      <div className="flex w-full items-center justify-between gap-xs">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-xs">{trayContent}</div>
        {submitButton}
      </div>
    ) : (
      trayContent
    );

  return (
    <div
      className={cn(
        'mx-auto w-full animate-in fade-in slide-in-from-bottom-2 duration-300',
        isComposer ? 'max-w-3xl' : 'max-w-[900px]'
      )}
    >
      <form onSubmit={handleSubmit} className="flex w-full flex-col">
        <div
          className={cn(
            'relative flex w-full flex-col transition-[box-shadow,border-color,border-radius] duration-200 rounded-3xl',
            isComposer
              ? cn(
                  'border border-border bg-white shadow-lg dark:bg-surface dark:shadow-sm',
                  'focus-within:shadow-xl focus-within:border-primary/30 dark:focus-within:shadow-md'
                )
              : cn(
                  'bg-background border-2 border-background-alt focus-within:border-primary-500 focus-within:shadow-sm',
                  trayWithSubmit && 'rounded-2xl'
                )
          )}
        >
          <div className="flex w-full items-center overflow-visible">
            <input
              type="text"
              value={value}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
              className={cn(
                'w-full flex-1 border-none bg-transparent text-base text-foreground shadow-none outline-none focus:border-none focus:bg-transparent focus:shadow-none focus:outline-none',
                isComposer
                  ? 'h-14 min-h-14 px-5 placeholder:text-foreground-muted/60'
                  : 'h-20 min-h-20 px-7 placeholder:text-foreground/60 max-md:h-[46px] max-md:min-h-[46px] max-md:px-4'
              )}
              placeholder={placeholder}
              aria-label="Suchfeld"
              disabled={loading}
            />
            <div className="flex shrink-0 items-center">
              {settingsContent}
              {onDeepResearchToggle && (
                <button
                  type="button"
                  className={cn(
                    'flex items-center justify-center rounded-full border-none bg-transparent p-2 transition-[color,background-color,opacity,transform] duration-200',
                    'text-foreground opacity-70 hover:scale-105 hover:bg-background-alt hover:text-primary-500 hover:opacity-100',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    isDeepResearchActive && 'bg-background-alt text-primary-500 opacity-100'
                  )}
                  onClick={onDeepResearchToggle}
                  aria-label={
                    isDeepResearchActive ? 'Deep Research deaktivieren' : 'Deep Research aktivieren'
                  }
                  disabled={loading}
                  title={isDeepResearchActive ? 'Deep Research aktiv' : 'Deep Research aktivieren'}
                >
                  <Icon category="ui" name="brain" />
                </button>
              )}
              {submitPlacement === 'inline' && submitButton}
            </div>
          </div>

          {trayWithSubmit && (
            <div
              className={cn(
                isComposer ? 'flex items-center justify-between px-2 pb-1' : 'px-3 pb-3 pt-0.5'
              )}
            >
              {trayWithSubmit}
            </div>
          )}
        </div>

        {!hideDisclaimer && (
          <div
            className={cn(
              'text-center leading-snug text-foreground opacity-70',
              isComposer ? 'mt-1 hidden text-xs sm:block' : 'mt-md px-sm text-[13px]'
            )}
          >
            KI-Systeme können Fakten falsch interpretieren oder erfinden. Bitte prüfe die Quellen.
          </div>
        )}
      </form>
    </div>
  );
};

export default SearchBar;
