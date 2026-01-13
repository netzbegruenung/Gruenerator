import { PiSun, PiMoon } from 'react-icons/pi';

interface ThemeToggleButtonProps {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const ThemeToggleButton = ({ darkMode, toggleDarkMode }: ThemeToggleButtonProps) => {
  return (
    <button
      className={`theme-toggle-button ${darkMode ? 'dark' : 'light'}`}
      onClick={toggleDarkMode}
      aria-label={darkMode ? "Zum hellen Modus wechseln" : "Zum dunklen Modus wechseln"}
    >
      <div className="theme-toggle-icon-wrapper">
        <PiSun className="theme-icon sun" aria-hidden="true" />
        <PiMoon className="theme-icon moon" aria-hidden="true" />
      </div>
    </button>
  );
};

export default ThemeToggleButton;
