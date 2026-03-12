import { type JSX, type ReactNode } from 'react';
import { FaSearch, FaStop } from 'react-icons/fa';

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
}: SearchBarProps): JSX.Element => {
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
            'flex items-center justify-center border-none bg-transparent p-0 text-red-600 transition-colors duration-200 hover:text-red-700',
            submitPlacement === 'inline' ? 'size-12' : 'size-8'
          )}
          onClick={onAbort}
          aria-label="Suche abbrechen"
          title="Suche abbrechen"
        >
          <FaStop className="size-[18px]" />
        </button>
      ) : (
        <button
          type="submit"
          className={cn(
            'flex items-center justify-center border-none bg-transparent p-0 transition-colors duration-200 hover:text-primary-500 disabled:cursor-not-allowed disabled:text-grey-400',
            submitPlacement === 'inline' ? 'size-12 text-foreground' : 'size-8 text-foreground/70'
          )}
          disabled={loading || !value?.trim()}
          aria-label="Suchen"
        >
          {loading ? (
            <div className="size-[18px] animate-spin rounded-full border-2 border-background-alt border-t-primary-500" />
          ) : (
            <FaSearch className="size-[18px]" />
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
      <div className="flex items-center gap-xs">
        <div className="flex flex-1 flex-wrap items-center gap-xs">{trayContent}</div>
        {submitButton}
      </div>
    ) : (
      trayContent
    );

  return (
    <div className="mx-auto w-full max-w-[900px] animate-in fade-in slide-in-from-bottom-2 duration-300">
      <form onSubmit={handleSubmit} className="flex w-full flex-col">
        <div
          className={cn(
            'relative flex w-full flex-col bg-background border-2 border-background-alt transition-[box-shadow,border-color,border-radius] duration-200 focus-within:border-primary-500 focus-within:shadow-sm',
            trayWithSubmit ? 'rounded-2xl' : 'rounded-3xl'
          )}
        >
          <div className="flex w-full items-center overflow-visible">
            <input
              type="text"
              value={value}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
              className="h-20 min-h-20 w-full flex-1 border-none bg-transparent px-7 text-base text-foreground shadow-none outline-none placeholder:text-foreground/60 focus:border-none focus:bg-transparent focus:shadow-none focus:outline-none max-md:h-[46px] max-md:min-h-[46px] max-md:px-4 max-md:text-base"
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

          {trayWithSubmit && <div className="px-3 pb-3 pt-0.5">{trayWithSubmit}</div>}
        </div>

        {!hideDisclaimer && (
          <div className="mt-md px-sm text-center text-[13px] leading-snug text-foreground opacity-70">
            KI-Systeme können Fakten falsch interpretieren oder erfinden. Bitte prüfe die Quellen.
          </div>
        )}
      </form>
    </div>
  );
};

export default SearchBar;
