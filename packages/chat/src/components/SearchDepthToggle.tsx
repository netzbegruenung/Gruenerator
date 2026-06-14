'use client';

import { memo } from 'react';
import { Telescope, Zap } from 'lucide-react';
import {
  DropdownMenuItem,
  ResponsiveMenu,
  ResponsiveMenuSection,
  ResponsiveMenuItem,
} from '@gruenerator/ui';
import { composerToolbarButtonClass } from '../lib/utils';
import { useChatDensity } from './thread/chatDensityContext';
import { SEARCH_DEPTHS, type SearchDepthIconKey } from '../lib/composerControls';
import { useScopedSearchMode, useScopedSetSearchMode } from '../lib/useScopedAgentState';

// Presentation only: the modes, labels, and descriptions come from the shared
// SEARCH_DEPTHS list; this maps the semantic icon key → lucide component.
const DEPTH_ICONS: Record<SearchDepthIconKey, typeof Zap> = {
  fast: Zap,
  deep: Telescope,
};

const DEPTH_CONFIG = SEARCH_DEPTHS.map((depth) => ({ ...depth, Icon: DEPTH_ICONS[depth.icon] }));

export const SearchDepthToggle = memo(function SearchDepthToggle() {
  const isCompact = useChatDensity() === 'compact';
  const searchMode = useScopedSearchMode();
  const setSearchMode = useScopedSetSearchMode();

  const active = DEPTH_CONFIG.find((d) => d.mode === searchMode) ?? DEPTH_CONFIG[0];
  const ActiveIcon = active.Icon;
  const activeClass = 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300';

  const desktopContent = (
    <>
      {DEPTH_CONFIG.map(({ mode, label, Icon }) => (
        <DropdownMenuItem
          key={mode}
          onSelect={() => setSearchMode(mode)}
          className={searchMode === mode ? activeClass : ''}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </DropdownMenuItem>
      ))}
    </>
  );

  const mobileContent = (
    <ResponsiveMenuSection title="Recherchetiefe">
      {DEPTH_CONFIG.map(({ mode, label, description, Icon }) => (
        <ResponsiveMenuItem
          key={mode}
          icon={<Icon />}
          active={searchMode === mode}
          onClick={() => setSearchMode(mode)}
        >
          <div className="flex flex-col">
            <span>{label}</span>
            <span className="text-[11px] text-foreground-muted">{description}</span>
          </div>
        </ResponsiveMenuItem>
      ))}
    </ResponsiveMenuSection>
  );

  return (
    <ResponsiveMenu
      sheetTitle="Recherchetiefe"
      trigger={
        <button
          type="button"
          className={`${composerToolbarButtonClass(isCompact)} rounded-full border border-primary-200 text-primary-700 dark:border-primary-400/30 dark:text-primary-300`}
        >
          <ActiveIcon className="h-4 w-4" />
          <span className="max-w-32 truncate text-[12px] font-medium tracking-tight">
            {active.label}
          </span>
        </button>
      }
      desktopContent={desktopContent}
      mobileContent={mobileContent}
    />
  );
});
