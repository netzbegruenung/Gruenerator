import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useMemo, useCallback, useRef, memo } from 'react';

import Icon from '../../../components/common/Icon';
import { type TabId, type UniversalSubType, TAB_CONFIGS } from '../types';

import { cn } from '@/utils/cn';

// Tabs that don't require authentication
const PUBLIC_TABS: TabId[] = ['presse-social'];

interface TabSelectorProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onUniversalSubTypeChange?: (subType: UniversalSubType) => void;
  selectedUniversalSubType?: UniversalSubType;
  disabled?: boolean;
  isAuthenticated?: boolean;
  onPreload?: (tabId: TabId) => void;
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
    selectedUniversalSubType,
    disabled = false,
    isAuthenticated = false,
    onPreload,
  }) => {
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

    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    const navigableTabIds = useMemo(() => {
      const regularIds = TAB_CONFIGS.filter((config) => config.id !== 'universal').map(
        (config) => config.id
      );
      return [...regularIds, 'universal' as TabId];
    }, []);

    const handleTabClick = useCallback(
      (tabId: TabId) => {
        if (!disabled && tabId !== activeTab) {
          onTabChange(tabId);
        }
      },
      [disabled, activeTab, onTabChange]
    );

    const handleTabListKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (disabled) return;
        const target = event.target as HTMLElement;
        if (target.getAttribute('role') !== 'tab') return;

        const currentId = navigableTabIds.find((id) => tabRefs.current[id] === target);
        if (!currentId) return;
        const currentIndex = navigableTabIds.indexOf(currentId);

        let nextIndex: number | null = null;

        switch (event.key) {
          case 'ArrowRight':
            nextIndex = (currentIndex + 1) % navigableTabIds.length;
            break;
          case 'ArrowLeft':
            nextIndex = (currentIndex - 1 + navigableTabIds.length) % navigableTabIds.length;
            break;
          case 'Home':
            nextIndex = 0;
            break;
          case 'End':
            nextIndex = navigableTabIds.length - 1;
            break;
          default:
            return;
        }

        event.preventDefault();
        const nextId = navigableTabIds[nextIndex];
        tabRefs.current[nextId]?.focus();
        onTabChange(nextId);
      },
      [disabled, navigableTabIds, onTabChange]
    );

    const handleUniversalOptionSelect = useCallback(
      (subType: UniversalSubType) => {
        if (onUniversalSubTypeChange) {
          onUniversalSubTypeChange(subType);
        }
      },
      [onUniversalSubTypeChange]
    );

    const isUniversalActive = activeTab === 'universal';

    return (
      <div
        className={cn(
          'flex flex-wrap justify-center gap-sm w-full max-[640px]:gap-xs',
          disabled && 'opacity-60 pointer-events-none'
        )}
        role="tablist"
        aria-label="Text-Generator auswählen"
        aria-orientation="horizontal"
        onKeyDown={handleTabListKeyDown}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              className={cn(
                'flex items-center gap-xs px-md py-sm',
                'border border-grey-300 dark:border-foreground rounded-full',
                'bg-transparent text-foreground text-[0.9rem] font-medium',
                'cursor-pointer transition-all duration-150 whitespace-nowrap',
                'hover:bg-background-alt',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'focus-visible:outline-2 focus-visible:outline-[var(--himmel)] focus-visible:outline-offset-2',
                'max-[640px]:px-sm max-[640px]:py-xs max-[640px]:text-[0.85rem]',
                'max-[400px]:px-sm max-[400px]:py-xs',
                isActive &&
                  'bg-secondary-600 border-secondary-600 text-white hover:bg-secondary-600'
              )}
              onClick={() => handleTabClick(tab.id)}
              onMouseEnter={() => onPreload?.(tab.id)}
              onFocus={() => onPreload?.(tab.id)}
              disabled={disabled}
              tabIndex={isActive ? 0 : -1}
            >
              <Icon
                category={tab.icon.category as any}
                name={tab.icon.name}
                size={18}
                className={cn(
                  'shrink-0 text-grey-600',
                  isActive && 'text-white brightness-0 invert'
                )}
              />
              <span className="max-[640px]:hidden">{tab.label}</span>
              <span className="hidden max-[640px]:inline max-[400px]:text-[0.75rem]">
                {tab.shortLabel}
              </span>
              {!isAuthenticated && !PUBLIC_TABS.includes(tab.id) && (
                <Icon
                  category="actions"
                  name="lock"
                  size={12}
                  className={cn(
                    'shrink-0 opacity-60 text-grey-500',
                    isActive && 'brightness-0 invert opacity-80'
                  )}
                />
              )}
            </button>
          );
        })}

        {universalTabConfig && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                ref={(el) => {
                  tabRefs.current['universal'] = el;
                }}
                type="button"
                role="tab"
                id="tab-universal"
                aria-selected={isUniversalActive}
                aria-controls="tabpanel-universal"
                className={cn(
                  'flex items-center gap-xs px-md py-sm pr-sm',
                  'border border-grey-300 dark:border-foreground rounded-full',
                  'bg-transparent text-foreground text-[0.9rem] font-medium',
                  'cursor-pointer transition-all duration-150 whitespace-nowrap',
                  'hover:bg-background-alt',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'focus-visible:outline-2 focus-visible:outline-[var(--himmel)] focus-visible:outline-offset-2',
                  'max-[640px]:px-sm max-[640px]:py-xs max-[640px]:text-[0.85rem]',
                  'max-[400px]:px-sm max-[400px]:py-xs',
                  isUniversalActive &&
                    'bg-secondary-600 border-secondary-600 text-white hover:bg-secondary-600'
                )}
                onMouseEnter={() => onPreload?.('universal')}
                onFocus={() => onPreload?.('universal')}
                disabled={disabled}
                tabIndex={isUniversalActive ? 0 : -1}
              >
                <Icon
                  category={TAB_ICONS['universal'].category as any}
                  name={TAB_ICONS['universal'].name}
                  size={18}
                  className={cn(
                    'shrink-0 text-grey-600',
                    isUniversalActive && 'text-white brightness-0 invert'
                  )}
                />
                <span className="max-[640px]:hidden">{universalTabConfig.label}</span>
                <span className="hidden max-[640px]:inline max-[400px]:text-[0.75rem]">
                  {universalTabConfig.shortLabel}
                </span>
                {!isAuthenticated && (
                  <Icon
                    category="actions"
                    name="lock"
                    size={12}
                    className={cn(
                      'shrink-0 opacity-60 text-grey-500',
                      isUniversalActive && 'brightness-0 invert opacity-80'
                    )}
                  />
                )}
                <Icon
                  category="ui"
                  name="caretDown"
                  size={14}
                  className={cn(
                    'ml-xxs transition-transform duration-200 text-grey-600',
                    isUniversalActive && 'text-white brightness-0 invert'
                  )}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {UNIVERSAL_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  className={cn(
                    selectedUniversalSubType === option.value && 'bg-hover-alt font-semibold'
                  )}
                  onSelect={() => handleUniversalOptionSelect(option.value)}
                >
                  <Icon
                    category={option.icon.category as any}
                    name={option.icon.name}
                    size={16}
                    className="text-grey-600"
                  />
                  <span>{option.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  }
);

TabSelector.displayName = 'TabSelector';

export default TabSelector;
