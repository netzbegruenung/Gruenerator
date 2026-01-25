import { useMemo, useCallback, memo, useState } from 'react';

import Icon from '../../../components/common/Icon';
import MenuDropdown from '../../../components/common/MenuDropdown';
import { type TabId, type UniversalSubType, TAB_CONFIGS } from '../types';
import './TabSelector.css';

// Tabs that don't require authentication
const PUBLIC_TABS: TabId[] = ['presse-social'];

interface TabSelectorProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onUniversalSubTypeChange?: (subType: UniversalSubType) => void;
  disabled?: boolean;
  isAuthenticated?: boolean;
}

const TAB_ICONS: Record<TabId, { category: string; name: string }> = {
  texte: { category: 'navigation', name: 'texte' },
  'presse-social': { category: 'platforms', name: 'pressemitteilung' },
  antrag: { category: 'textTypes', name: 'antrag' },
  universal: { category: 'textTypes', name: 'universal' },
  barrierefreiheit: { category: 'navigation', name: 'barrierefreiheit' },
  texteditor: { category: 'actions', name: 'edit' },
  eigene: { category: 'navigation', name: 'eigene' },
};

const UNIVERSAL_OPTIONS: {
  value: UniversalSubType;
  label: string;
  icon: { category: string; name: string };
}[] = [
  { value: 'rede', label: 'Rede', icon: { category: 'textTypes', name: 'rede' } },
  {
    value: 'wahlprogramm',
    label: 'Wahlprogramm',
    icon: { category: 'textTypes', name: 'wahlprogramm' },
  },
  {
    value: 'buergeranfragen',
    label: 'Bürger*innenanfragen',
    icon: { category: 'textTypes', name: 'buergeranfragen' },
  },
  {
    value: 'leichte_sprache',
    label: 'Leichte Sprache',
    icon: { category: 'accessibility', name: 'leichteSprache' },
  },
];

const TabSelector: React.FC<TabSelectorProps> = memo(
  ({
    activeTab,
    onTabChange,
    onUniversalSubTypeChange,
    disabled = false,
    isAuthenticated = false,
  }) => {
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const tabs = useMemo(
      () =>
        TAB_CONFIGS.filter((config) => config.id !== 'universal').map((config) => ({
          id: config.id,
          label: config.label,
          shortLabel: config.shortLabel,
          icon: TAB_ICONS[config.id],
        })),
      []
    );

    const universalTabConfig = useMemo(
      () => TAB_CONFIGS.find((config) => config.id === 'universal'),
      []
    );

    const handleTabClick = useCallback(
      (tabId: TabId) => {
        if (!disabled && tabId !== activeTab) {
          onTabChange(tabId);
        }
      },
      [disabled, activeTab, onTabChange]
    );

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent, tabId: TabId) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleTabClick(tabId);
        }
      },
      [handleTabClick]
    );

    const handleUniversalOptionSelect = useCallback(
      (subType: UniversalSubType) => {
        if (onUniversalSubTypeChange) {
          onUniversalSubTypeChange(subType);
        }
        onTabChange('universal');
        setDropdownOpen(false);
      },
      [onUniversalSubTypeChange, onTabChange]
    );

    const handleDropdownKeyDown = useCallback(
      (event: React.KeyboardEvent, subType: UniversalSubType) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleUniversalOptionSelect(subType);
        }
      },
      [handleUniversalOptionSelect]
    );

    const isUniversalActive = activeTab === 'universal';

    return (
      <div
        className={`texte-tab-selector ${disabled ? 'disabled' : ''}`}
        role="tablist"
        aria-label="Text-Generator auswählen"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              className={`texte-tab-button ${isActive ? 'active' : ''}`}
              onClick={() => handleTabClick(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, tab.id)}
              disabled={disabled}
              tabIndex={isActive ? 0 : -1}
            >
              <Icon
                category={tab.icon.category as any}
                name={tab.icon.name}
                size={18}
                className="texte-tab-icon"
              />
              <span className="texte-tab-label">{tab.label}</span>
              <span className="texte-tab-label-short">{tab.shortLabel}</span>
              {!isAuthenticated && !PUBLIC_TABS.includes(tab.id) && (
                <Icon category="actions" name="lock" size={12} className="texte-tab-lock-icon" />
              )}
            </button>
          );
        })}

        {universalTabConfig && (
          <MenuDropdown
            trigger={
              <button
                type="button"
                role="tab"
                aria-selected={isUniversalActive}
                aria-haspopup="menu"
                aria-expanded={dropdownOpen}
                className={`texte-tab-button has-dropdown ${isUniversalActive ? 'active' : ''}`}
                disabled={disabled}
                tabIndex={isUniversalActive ? 0 : -1}
              >
                <Icon
                  category={TAB_ICONS['universal'].category as any}
                  name={TAB_ICONS['universal'].name}
                  size={18}
                  className="texte-tab-icon"
                />
                <span className="texte-tab-label">{universalTabConfig.label}</span>
                <span className="texte-tab-label-short">{universalTabConfig.shortLabel}</span>
                {!isAuthenticated && (
                  <Icon category="actions" name="lock" size={12} className="texte-tab-lock-icon" />
                )}
                <Icon
                  category="ui"
                  name="caretDown"
                  size={14}
                  className="texte-tab-dropdown-icon"
                />
              </button>
            }
            alignRight={false}
            className="texte-tab-dropdown-container"
          >
            {({ onClose }) => (
              <div className="texte-tab-dropdown-menu">
                {UNIVERSAL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="texte-tab-dropdown-item"
                    onClick={() => {
                      handleUniversalOptionSelect(option.value);
                      onClose();
                    }}
                    onKeyDown={(e) => handleDropdownKeyDown(e, option.value)}
                  >
                    <Icon
                      category={option.icon.category as any}
                      name={option.icon.name}
                      size={16}
                    />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </MenuDropdown>
        )}
      </div>
    );
  }
);

TabSelector.displayName = 'TabSelector';

export default TabSelector;
