import { type JSX, type ReactNode } from 'react';
import { FaSearch, FaStop } from 'react-icons/fa';

import Icon from '../../../components/common/Icon';

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
  isStreaming = false,
  onAbort,
}: SearchBarProps): JSX.Element => {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (value?.trim() && !loading) {
      onSearch(value.trim());
    }
  };

  const handleDeepResearchToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (onDeepResearchToggle) {
      onDeepResearchToggle();
    }
  };

  return (
    <div className="mx-auto w-full max-w-[584px] animate-in fade-in slide-in-from-bottom-2 duration-300">
      <form onSubmit={handleSubmit} className="flex w-full flex-col">
        <div className="relative flex w-full items-center overflow-visible rounded-3xl border-2 border-background-alt bg-background transition-[box-shadow,border-color] duration-200 focus-within:border-primary-500 focus-within:shadow-sm">
          <input
            type="text"
            value={value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
            className="h-12 min-h-12 w-full flex-1 border-none bg-transparent px-4 text-base text-foreground shadow-none outline-none placeholder:text-foreground/60 focus:border-none focus:bg-transparent focus:shadow-none focus:outline-none max-md:h-[42px] max-md:min-h-[42px] max-md:text-[15px]"
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
                onClick={handleDeepResearchToggle}
                aria-label={
                  isDeepResearchActive ? 'Deep Research deaktivieren' : 'Deep Research aktivieren'
                }
                disabled={loading}
                title={isDeepResearchActive ? 'Deep Research aktiv' : 'Deep Research aktivieren'}
              >
                <Icon category="ui" name="brain" />
              </button>
            )}
            {isStreaming ? (
              <button
                type="button"
                className="flex size-12 items-center justify-center border-none bg-transparent p-0 text-red-600 transition-colors duration-200 hover:text-red-700"
                onClick={onAbort}
                aria-label="Suche abbrechen"
                title="Suche abbrechen"
              >
                <FaStop className="size-[18px]" />
              </button>
            ) : (
              <button
                type="submit"
                className="flex size-12 items-center justify-center border-none bg-transparent p-0 text-foreground transition-colors duration-200 hover:text-primary-500 disabled:cursor-not-allowed disabled:text-grey-400"
                disabled={loading || !value?.trim()}
                aria-label="Suchen"
              >
                {loading ? (
                  <div className="size-[18px] animate-spin rounded-full border-2 border-background-alt border-t-primary-500" />
                ) : (
                  <FaSearch className="size-[18px]" />
                )}
              </button>
            )}
          </div>
        </div>

        {!hideDisclaimer && (
          <div className="mt-md px-sm text-center text-[13px] leading-snug text-foreground opacity-70">
            KI-Systeme können Fakten falsch interpretieren oder erfinden. Bitte prüfe die Quellen.
          </div>
        )}

        {!hideExamples && exampleQuestions && exampleQuestions.length > 0 && (
          <div className="mt-md flex flex-wrap justify-center gap-sm max-md:flex-col max-md:items-center">
            {exampleQuestions.map((question, index) => (
              <button
                key={index}
                type="button"
                className="flex items-center gap-2 rounded-2xl border-none bg-background-alt px-4 py-2 text-sm text-foreground transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-hover-alt max-md:w-full max-md:max-w-[280px] max-md:justify-center"
                onClick={() => question.text && onChange?.(question.text)}
              >
                <span>{question.icon}</span>
                <span>{question.text}</span>
              </button>
            ))}
          </div>
        )}
      </form>
    </div>
  );
};

export default SearchBar;
