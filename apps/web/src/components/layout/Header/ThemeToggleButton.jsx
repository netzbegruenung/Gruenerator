import React from 'react';
import { PiSun, PiMoon } from 'react-icons/pi';

const ThemeToggleButton = ({ darkMode, toggleDarkMode }) => {
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