import { buildGroupPath } from '@gruenerator/shared/groups';
import { memo, useCallback, useState } from 'react';
import { PiUsersThree, PiCaretRight } from 'react-icons/pi';

import { useGroups } from '../../../features/groups/hooks/useGroups';

import { cn } from '@/utils/cn';

const EXPANDED_KEY = 'sidebar-spaces-expanded';

/**
 * "Spaces" section at the top of the chat sidebar. Lists the user's Spaces
 * (groups they belong to — personal + team) as links to their Space home.
 * Chats are filed into a Space via "Zu Space hinzufügen" on a chat.
 */
export const SpacesSidebarSection = memo(function SpacesSidebarSection({
  sidebarExpanded,
  onLinkClick,
  isActive,
}: {
  sidebarExpanded: boolean;
  onLinkClick: (path: string, title: string) => void;
  isActive: (path: string) => boolean;
}) {
  const { userGroups } = useGroups({ isActive: true });

  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(EXPANDED_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(EXPANDED_KEY, next ? '1' : '0');
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, []);

  const spaces = userGroups ?? [];
  // Spaces only render in the expanded sidebar (no icon-rail entries).
  if (!sidebarExpanded || spaces.length === 0) return null;

  return (
    <div className="px-2 pt-2">
      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-1.5 px-3 py-1 text-xs font-medium text-grey-500 transition-colors hover:text-foreground"
      >
        <span>Spaces</span>
        <PiCaretRight
          className={cn('h-3 w-3 shrink-0 transition-transform', isExpanded && 'rotate-90')}
          aria-hidden="true"
        />
      </button>

      {isExpanded && (
        <div className="mt-0.5">
          {spaces.map((g) => {
            const path = buildGroupPath(g);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onLinkClick(path, g.name)}
                className={cn(
                  'group flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-secondary-50 dark:hover:bg-secondary-800/40',
                  isActive(path) && 'bg-secondary-100 font-medium dark:bg-secondary-800/60'
                )}
              >
                <PiUsersThree size={16} className="shrink-0 text-grey-500" />
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
