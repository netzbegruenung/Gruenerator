import { motion } from 'motion/react';
import { memo } from 'react';
import { HiPlus, HiShieldCheck, HiUserGroup } from 'react-icons/hi';

import { getGroupInitials } from '../../../../../../../features/groups/hooks/useGroups';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface Group {
  id: string;
  name: string;
  isAdmin?: boolean;
}

interface TabIndexConfig {
  createGroupButton?: number;
}

interface GroupsOverviewSectionProps {
  userGroups: Group[] | null | undefined;
  isCreatingGroup: boolean;
  onCreateNew: () => void;
  onSelectGroup: (groupId: string) => void;
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
    onSelectGroup,
    tabIndex,
  }: GroupsOverviewSectionProps): React.ReactElement => {
    const hasGroups = userGroups && userGroups.length > 0;

    if (!hasGroups) {
      return (
        <motion.div
          className="flex flex-col items-center justify-center py-2xl"
          initial={MOTION_CONFIG.initial}
          animate={MOTION_CONFIG.animate}
          transition={MOTION_CONFIG.transition}
        >
          <div className="flex flex-col items-center gap-lg max-w-[32rem] text-center">
            <div className="flex items-center justify-center size-24 rounded-full bg-primary-500/10">
              <HiUserGroup className="text-5xl text-primary-500" />
            </div>
            <div className="flex flex-col gap-xs">
              <h2 className="text-2xl font-semibold text-foreground">Zusammen stärker</h2>
              <p className="text-base text-foreground leading-relaxed text-center">
                Erstelle eine Gruppe, um Anweisungen und Wissen mit deinem Team zu teilen und
                gemeinsam an Texten zu arbeiten.
              </p>
            </div>
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
          </div>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
          {/* Create new group card */}
          <button
            onClick={onCreateNew}
            disabled={isCreatingGroup}
            tabIndex={tabIndex.createGroupButton}
            aria-label="Neue Gruppe erstellen"
            className="cursor-pointer"
          >
            <Card className="flex flex-col items-center justify-center gap-sm p-xl border-2 border-dashed border-grey-300 dark:border-grey-600 hover:border-primary-500 dark:hover:border-primary-500 hover:bg-primary-500/5 transition-colors h-full min-h-[160px]">
              <div className="flex items-center justify-center size-14 rounded-full bg-primary-500/10">
                <HiPlus className="text-2xl text-primary-500" />
              </div>
              <span className="text-base font-semibold text-foreground">
                {isCreatingGroup ? 'Wird erstellt...' : 'Neue Gruppe'}
              </span>
              <span className="text-xs text-foreground">Team erstellen & einladen</span>
            </Card>
          </button>

          {/* Group cards */}
          {userGroups.map((group, index) => (
            <motion.button
              key={group.id}
              onClick={() => onSelectGroup(group.id)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              className="text-left cursor-pointer"
            >
              <Card className="flex items-start gap-md p-lg hover:border-primary-500 dark:hover:border-primary-500 hover:shadow-md transition-all h-full min-h-[160px]">
                <div className="flex items-center justify-center size-14 rounded-xl bg-primary-500 text-white text-xl font-bold shrink-0">
                  {getGroupInitials(group.name)}
                </div>
                <div className="flex flex-col gap-xs min-w-0 flex-1">
                  <span className="text-lg font-semibold text-foreground truncate">
                    {group.name}
                  </span>
                  <span className="inline-flex items-center gap-xxs text-xs text-foreground">
                    {group.isAdmin ? (
                      <>
                        <HiShieldCheck className="text-primary-500" />
                        Admin
                      </>
                    ) : (
                      'Mitglied'
                    )}
                  </span>
                </div>
              </Card>
            </motion.button>
          ))}
        </div>
      </motion.div>
    );
  }
);

GroupsOverviewSection.displayName = 'GroupsOverviewSection';

export default GroupsOverviewSection;
