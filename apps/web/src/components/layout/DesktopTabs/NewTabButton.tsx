import React from 'react';
import { useNavigate } from 'react-router-dom';

import { useDesktopTabsStore } from '../../../stores/desktopTabsStore';

const NewTabButton: React.FC = () => {
  const navigate = useNavigate();
  const { createTab, maxTabs, tabs } = useDesktopTabsStore();

  const handleClick = () => {
    if (tabs.length >= maxTabs) {
      return;
    }
    createTab('/', 'Start');
    void navigate('/');
  };

  const isDisabled = tabs.length >= maxTabs;

  return (
    <button
      className="flex items-center justify-center w-7 h-7 border-none bg-transparent rounded-md cursor-pointer text-grey-400 dark:text-grey-500 transition-all duration-150 ease-in-out shrink-0 p-0 ml-0.5 hover:enabled:bg-grey-100 hover:enabled:text-primary-600 hover:enabled:scale-105 dark:hover:enabled:bg-grey-800 dark:hover:enabled:text-primary-400 active:enabled:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
      onClick={handleClick}
      disabled={isDisabled}
      aria-label="Neuen Tab öffnen"
      title={isDisabled ? `Maximum ${maxTabs} Tabs erreicht` : 'Neuen Tab öffnen (Strg+T)'}
    >
      <svg width="12" height="12" viewBox="0 0 12 12">
        <line
          x1="6"
          y1="1"
          x2="6"
          y2="11"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="1"
          y1="6"
          x2="11"
          y2="6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
};

export default NewTabButton;
