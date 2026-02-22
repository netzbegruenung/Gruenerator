import { motion } from 'motion/react';
import { useState, useEffect, useCallback, memo, useMemo } from 'react';

import { useGroups, getGroupInitials } from '../../../../../../features/groups/hooks/useGroups';
import { useOptimizedAuth } from '../../../../../../hooks/useAuth';
import { useRovingTabindex } from '../../../../../../hooks/useKeyboardNavigation';
import { useTabIndex } from '../../../../../../hooks/useTabIndex';
import { useGroupsStore } from '../../../../../../stores/auth/groupsStore';
import { announceToScreenReader } from '../../../../../../utils/focusManagement';

import GroupDetailSection from './components/GroupDetailSection';
import GroupsCreateSection from './components/GroupsCreateSection';
import GroupsOverviewSection from './components/GroupsOverviewSection';

import { cn } from '@/utils/cn';

// Static motion config moved outside component
const MOTION_CONFIG = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.3 },
} as const;

interface Group {
  id: string;
  name: string;
  isAdmin?: boolean;
}

interface GroupsManagementViewProps {
  isActive: boolean;
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
}

const GroupsManagementView = memo(
  ({
    isActive,
    onSuccessMessage,
    onErrorMessage,
  }: GroupsManagementViewProps): React.ReactElement => {
    const { user } = useOptimizedAuth();
    const tabIndex = useTabIndex('PROFILE_GROUPS');
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    const {
      selectedGroupId,
      currentView,
      hasInitialAutoSelection,
      setSelectedGroup,
      setCurrentView,
      setHasInitialAutoSelection,
    } = useGroupsStore();

    const {
      userGroups,
      createGroup,
      isCreatingGroup,
      isCreateGroupError,
      createGroupError,
      isDeleteGroupSuccess,
    } = useGroups({ isActive });

    const handleCreateGroup = useCallback(
      (groupName: string) => {
        if (isCreatingGroup) return;

        const name = groupName.trim() || 'unbenannte Gruppe';

        onSuccessMessage('');
        onErrorMessage('');
        createGroup(name, {
          onSuccess: (newGroup: Group) => {
            setCreateDialogOpen(false);
            setSelectedGroup(newGroup.id);
            onSuccessMessage(`Gruppe "${name}" erfolgreich erstellt!`);
          },
          onError: (error: Error | null) => {
            onErrorMessage(error?.message || 'Gruppe konnte nicht erstellt werden.');
          },
        });
      },
      [isCreatingGroup, onSuccessMessage, onErrorMessage, createGroup, setSelectedGroup]
    );

    useEffect(() => {
      if (!userGroups) return;
      if (!hasInitialAutoSelection) {
        if (userGroups.length === 1 && !selectedGroupId && currentView === 'overview') {
          setSelectedGroup(userGroups[0].id);
        }
        setHasInitialAutoSelection(true);
      }
    }, [
      userGroups,
      selectedGroupId,
      currentView,
      hasInitialAutoSelection,
      setSelectedGroup,
      setHasInitialAutoSelection,
    ]);

    useEffect(() => {
      if (!userGroups) return;
      if (userGroups.length === 0 && selectedGroupId !== null) {
        setSelectedGroup(null);
      }
    }, [userGroups, selectedGroupId, setSelectedGroup]);

    useEffect(() => {
      if (isDeleteGroupSuccess && selectedGroupId && userGroups) {
        const deletedGroupWasSelected = !userGroups.some((g: Group) => g.id === selectedGroupId);
        if (deletedGroupWasSelected) {
          onSuccessMessage('Gruppe erfolgreich gelöscht!');
          if (userGroups.length > 0) {
            setSelectedGroup(userGroups[0].id);
          } else {
            setSelectedGroup(null);
          }
        }
      }
    }, [isDeleteGroupSuccess, selectedGroupId, userGroups, onSuccessMessage, setSelectedGroup]);

    const handleSelectGroup = useCallback(
      (groupId: string) => {
        if (selectedGroupId !== groupId) {
          onSuccessMessage('');
          onErrorMessage('');
          setSelectedGroup(groupId);
        }
      },
      [selectedGroupId, onSuccessMessage, onErrorMessage, setSelectedGroup]
    );

    const handleCreateNew = useCallback(() => {
      setCreateDialogOpen(true);
      onSuccessMessage('');
      onErrorMessage('');
    }, [onSuccessMessage, onErrorMessage]);

    const handleTabClick = useCallback(
      (view: string) => {
        setCurrentView(view as 'overview' | 'group' | 'create');
        if (view === 'overview') {
          setSelectedGroup(null);
        }
        onSuccessMessage('');
        onErrorMessage('');
        announceToScreenReader(`${view === 'overview' ? 'Übersicht' : view} ausgewählt`);
      },
      [setCurrentView, setSelectedGroup, onSuccessMessage, onErrorMessage]
    );

    // Memoize navigation items to prevent recreation
    const navigationItems = useMemo<string[]>(
      () => ['overview', ...(userGroups ? userGroups.map((g: Group) => `group-${g.id}`) : [])],
      [userGroups]
    );

    // Memoize default active item
    const defaultActiveItem = useMemo(
      () => (currentView === 'overview' ? 'overview' : `group-${selectedGroupId}`),
      [currentView, selectedGroupId]
    );

    const { getItemProps } = useRovingTabindex({
      items: navigationItems,
      defaultActiveItem,
    });

    // Memoize tab index configs to prevent object recreation
    const overviewTabIndex = useMemo(
      () => ({
        createGroupButton: tabIndex.get?.('createGroupButton') ?? 1,
      }),
      [tabIndex]
    );

    const detailTabIndex = useMemo(
      () => ({
        groupDetailTabs: tabIndex.get?.('groupDetailTabs') ?? 1,
        groupNameEdit: tabIndex.get?.('groupNameEdit') ?? 5,
      }),
      [tabIndex]
    );

    const tabBase =
      'flex items-center gap-xs px-md py-xs rounded-full border text-sm font-medium transition-colors whitespace-nowrap cursor-pointer';
    const tabInactive =
      'bg-background border-grey-300 dark:border-grey-600 text-foreground hover:bg-background-alt hover:border-primary-500';
    const tabActive = 'bg-background-alt border-primary-500 text-primary-500 font-semibold';

    const renderNavigationPanel = () => (
      <nav className="flex flex-wrap gap-sm mb-lg" role="tablist" aria-label="Gruppen Navigation">
        <button
          {...getItemProps('overview')}
          className={cn(tabBase, currentView === 'overview' ? tabActive : tabInactive)}
          onClick={() => handleTabClick('overview')}
          role="tab"
          aria-selected={currentView === 'overview'}
          aria-controls="overview-panel"
          id="overview-tab"
        >
          Übersicht
        </button>

        {userGroups &&
          userGroups.map((group: Group) => (
            <button
              key={group.id}
              {...getItemProps(`group-${group.id}`)}
              className={cn(tabBase, selectedGroupId === group.id ? tabActive : tabInactive)}
              onClick={() => handleSelectGroup(group.id)}
              role="tab"
              aria-selected={selectedGroupId === group.id}
              aria-controls={`group-${group.id}-panel`}
              id={`group-${group.id}-tab`}
              aria-label={`Gruppe ${group.name} ${group.isAdmin ? '(Admin)' : '(Mitglied)'}`}
            >
              <span className="flex items-center justify-center size-6 rounded-full bg-primary-500 text-white text-[0.7rem] font-semibold shrink-0">
                {getGroupInitials(group.name)}
              </span>
              <span className="truncate max-w-[150px]">{group.name}</span>
            </button>
          ))}
      </nav>
    );

    const renderContentPanel = () => {
      if (currentView === 'group' && selectedGroupId) {
        return (
          <GroupDetailSection
            groupId={selectedGroupId}
            onSuccessMessage={onSuccessMessage}
            onErrorMessage={onErrorMessage}
            isActive={isActive}
            tabIndex={detailTabIndex}
          />
        );
      }

      return (
        <GroupsOverviewSection
          userGroups={userGroups}
          isCreatingGroup={isCreatingGroup}
          onCreateNew={handleCreateNew}
          tabIndex={overviewTabIndex}
        />
      );
    };

    return (
      <motion.div
        className="flex flex-col gap-lg"
        initial={MOTION_CONFIG.initial}
        animate={MOTION_CONFIG.animate}
        transition={MOTION_CONFIG.transition}
      >
        {userGroups && userGroups.length > 0 && renderNavigationPanel()}
        {renderContentPanel()}

        <GroupsCreateSection
          isOpen={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onCreateGroup={handleCreateGroup}
          isCreatingGroup={isCreatingGroup}
          isCreateGroupError={isCreateGroupError}
          createGroupError={createGroupError}
        />
      </motion.div>
    );
  }
);

GroupsManagementView.displayName = 'GroupsManagementView';

export default GroupsManagementView;
