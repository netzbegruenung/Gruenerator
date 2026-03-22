import { Button } from '@gruenerator/ui';
import { motion } from 'motion/react';
import { memo, useMemo } from 'react';
import { HiPlus, HiUserGroup } from 'react-icons/hi';

import ToolGrid from '../../../components/common/ToolGrid';

import type { ToolEntry } from '../../../components/common/ToolGrid';
import type { GroupSummary } from '../hooks/useGroups';

interface TabIndexConfig {
  createGroupButton?: number;
}

interface GroupsOverviewSectionProps {
  userGroups: GroupSummary[] | null | undefined;
  isCreatingGroup: boolean;
  onCreateNew: () => void;
  tabIndex: TabIndexConfig;
}

const MOTION_CONFIG = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.3 },
} as const;

const GroupsOverviewSection = memo(
  ({
    userGroups,
    isCreatingGroup,
    onCreateNew,
    tabIndex,
  }: GroupsOverviewSectionProps): React.ReactElement => {
    const hasGroups = userGroups && userGroups.length > 0;

    const tools: ToolEntry[] = useMemo(
      () =>
        (userGroups || []).map((g) => {
          const entry: ToolEntry = {
            id: g.id,
            title: g.name,
            description: 'Gruppe',
            path: `/gruppen/${g.id}`,
            icon: HiUserGroup,
          };
          if (g.avatar_url) {
            entry.imageUrl = `/api/auth/groups/${g.id}/avatar`;
          }
          return entry;
        }),
      [userGroups]
    );

    if (!hasGroups) {
      return (
        <motion.div
          className="flex flex-col items-center justify-center py-2xl"
          initial={MOTION_CONFIG.initial}
          animate={MOTION_CONFIG.animate}
          transition={MOTION_CONFIG.transition}
        >
          <Button
            onClick={onCreateNew}
            disabled={isCreatingGroup}
            tabIndex={tabIndex.createGroupButton}
            aria-label="Neue Gruppe erstellen"
            size="lg"
          >
            <HiPlus />
            {isCreatingGroup ? 'Wird erstellt...' : 'Erste Gruppe erstellen'}
          </Button>
        </motion.div>
      );
    }

    return (
      <motion.div
        className="flex flex-col gap-md"
        initial={MOTION_CONFIG.initial}
        animate={MOTION_CONFIG.animate}
        transition={MOTION_CONFIG.transition}
      >
        <div className="flex items-center gap-xs">
          <h2 className="text-xl font-semibold text-foreground-heading m-0">Deine Gruppen</h2>
          <button
            type="button"
            onClick={onCreateNew}
            disabled={isCreatingGroup}
            tabIndex={tabIndex.createGroupButton}
            className="flex items-center justify-center w-7 h-7 rounded-full text-primary-600 hover:bg-primary-600/10 transition-colors cursor-pointer"
            aria-label="Neue Gruppe erstellen"
          >
            <HiPlus size={18} />
          </button>
        </div>

        <ToolGrid tools={tools} columns={2} />
      </motion.div>
    );
  }
);

GroupsOverviewSection.displayName = 'GroupsOverviewSection';

export default GroupsOverviewSection;
