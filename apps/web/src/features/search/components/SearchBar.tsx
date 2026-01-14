import { JSX, useState, useRef, useEffect, ChangeEvent, ReactNode } from 'react';
import { FaSearch } from 'react-icons/fa';
import { HiCog } from 'react-icons/hi';
import Icon from '../../../components/common/Icon';
import '../styles/SearchBarStyles.css';

const defaultExampleQuestions = [
  {
    icon: '🚲',
    text: 'Verkehrswende in Kommunen Beispiele'
  },
  {
    icon: '🌍',
    text: 'Klimaschutz für Kommunen Ideen'
  }
];

interface SearchBarProps {
  onSearch: (query?: string) => void;
  loading?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  exampleQuestions?: {
    icon?: string;
    text?: string
  }[];
  onDeepResearchToggle?: () => void;
  isDeepResearchActive?: boolean;
  hideExamples?: boolean;
  hideDisclaimer?: boolean;
  settingsContent?: ReactNode;
}

const SearchBar = ({ onSearch,
  loading,
  value,
  onChange,
  placeholder = 'Suchbegriff eingeben...',
  exampleQuestions = defaultExampleQuestions,
  onDeepResearchToggle,
  isDeepResearchActive = false,
  hideExamples = false,
  hideDisclaimer = false,
  settingsContent = null }: SearchBarProps): JSX.Element => {
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    };

    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettings]);

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
    <div className="search-bar-container">
      <form onSubmit={handleSubmit} className="search-form">
        <div className="search-input-wrapper">
          <input
            type="text"
            value={value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
            className="search-input"
            placeholder={placeholder}
            aria-label="Suchfeld"
            disabled={loading}
          />
          <div className="search-buttons">
            {settingsContent && (
              <div className="search-settings" ref={settingsRef}>
                <button
                  type="button"
                  className={`search-settings-toggle ${showSettings ? 'active' : ''}`}
                  onClick={() => setShowSettings(!showSettings)}
                  aria-label="Einstellungen"
                  title="Einstellungen"
                >
                  <HiCog />
                </button>
                {showSettings && (
                  <div className="search-settings-dropdown">
                    {settingsContent}
                  </div>
                )}
              </div>
            )}
            {onDeepResearchToggle && (
              <button
                type="button"
                className={`deep-research-toggle ${isDeepResearchActive ? 'active' : ''}`}
                onClick={handleDeepResearchToggle}
                aria-label={isDeepResearchActive ? 'Deep Research deaktivieren' : 'Deep Research aktivieren'}
                disabled={loading}
                title={isDeepResearchActive ? 'Deep Research aktiv' : 'Deep Research aktivieren'}
              >
                <Icon category="ui" name="brain" />
              </button>
            )}
            <button
              type="submit"
              className="search-icon-button"
              disabled={loading || !value?.trim()}
              aria-label="Suchen"
            >
              {loading ? (
                <div className="button-spinner"></div>
              ) : (
                <FaSearch className="search-icon" />
              )}
            </button>
          </div>
        </div>

        {!hideDisclaimer && (
          <div className="ai-disclaimer">
            KI-Systeme können Fakten falsch interpretieren oder erfinden. Bitte prüfe die Quellen.
          </div>
        )}

        {!hideExamples && exampleQuestions && exampleQuestions.length > 0 && (
          <div className="example-questions">
            {exampleQuestions.map((question, index) => (
              <button
                key={index}
                type="button"
                className="example-question"
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
