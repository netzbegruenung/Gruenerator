import { useEffect, useCallback, memo, useMemo } from 'react';
import { useForm, FormProvider, Control } from 'react-hook-form';
import { motion } from "motion/react";

import { useGroups, getGroupInitials } from '../../../../../../features/groups/hooks/useGroups';
import { useOptimizedAuth } from '../../../../../../hooks/useAuth';
import { useFormFields } from '../../../../../../components/common/Form/hooks';
import { useGroupsStore } from '../../../../../../stores/auth/groupsStore';
import { useTabIndex } from '../../../../../../hooks/useTabIndex';
import { useRovingTabindex } from '../../../../../../hooks/useKeyboardNavigation';
import { announceToScreenReader } from '../../../../../../utils/focusManagement';

import GroupsOverviewSection from './components/GroupsOverviewSection';
import GroupsCreateSection from './components/GroupsCreateSection';
import GroupDetailSection from './components/GroupDetailSection';

import '../../../../../generators/styles/custom-generators-tab.css';
import '../../../../../../assets/styles/features/auth/profile-layout.css';
import '../../../../../../assets/styles/features/groups/groups.css';

// Static motion config moved outside component
const MOTION_CONFIG = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.3 }
} as const;

interface Group {
    id: string;
    name: string;
    isAdmin?: boolean;
}

interface CreateGroupFormData {
    groupName: string;
}

interface FormFieldsReturn {
    Input: React.ComponentType<{
        name: string;
        type: string;
        label: string;
        placeholder: string;
        rules?: Record<string, unknown>;
        disabled?: boolean;
        control: Control<CreateGroupFormData>;
        tabIndex?: number;
    }>;
    Textarea: React.ComponentType<unknown>;
    AutoInput: React.ComponentType<unknown>;
    Select: React.ComponentType<unknown>;
    Checkbox: React.ComponentType<unknown>;
}

interface GroupsManagementViewProps {
    isActive: boolean;
    onSuccessMessage: (message: string) => void;
    onErrorMessage: (message: string) => void;
}

const GroupsManagementView = memo(({
    isActive,
    onSuccessMessage,
    onErrorMessage
}: GroupsManagementViewProps): React.ReactElement => {
    const { user } = useOptimizedAuth();
    const tabIndex = useTabIndex('PROFILE_GROUPS');

    const {
        selectedGroupId,
        currentView,
        hasInitialAutoSelection,
        setSelectedGroup,
        setCurrentView,
        setHasInitialAutoSelection,
    } = useGroupsStore();

    const createGroupFormMethods = useForm<CreateGroupFormData>({
        defaultValues: { groupName: '' },
        mode: 'onSubmit'
    });
    const { control: createGroupControl, reset: resetCreateGroup, handleSubmit: handleCreateGroupSubmit } = createGroupFormMethods;
    const formFields = useFormFields() as FormFieldsReturn;
    const Input = formFields.Input;

    const {
        userGroups,
        createGroup,
        isCreatingGroup,
        isCreateGroupError,
        createGroupError,
        isDeleteGroupSuccess,
    } = useGroups({ isActive });

    const handleCreateGroupFormSubmit = useCallback((data: CreateGroupFormData) => {
        if (isCreatingGroup) return;

        const groupName = data.groupName?.trim() || 'unbenannte Gruppe';

        onSuccessMessage('');
        onErrorMessage('');
        createGroup(groupName, {
            onSuccess: (newGroup: Group) => {
                setSelectedGroup(newGroup.id);
                resetCreateGroup();
                onSuccessMessage(`Gruppe "${groupName}" erfolgreich erstellt!`);
            },
            onError: (error: Error | null) => {
                onErrorMessage(error?.message || 'Gruppe konnte nicht erstellt werden.');
            }
        });
    }, [isCreatingGroup, onSuccessMessage, onErrorMessage, createGroup, setSelectedGroup, resetCreateGroup]);

    useEffect(() => {
        if (!userGroups) return;
        if (!hasInitialAutoSelection) {
            if (userGroups.length === 1 && !selectedGroupId && currentView === 'overview') {
                setSelectedGroup(userGroups[0].id);
            }
            setHasInitialAutoSelection(true);
        }
    }, [userGroups, selectedGroupId, currentView, hasInitialAutoSelection, setSelectedGroup, setHasInitialAutoSelection]);

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

    const handleSelectGroup = useCallback((groupId: string) => {
        if (selectedGroupId !== groupId) {
            onSuccessMessage('');
            onErrorMessage('');
            setSelectedGroup(groupId);
        }
    }, [selectedGroupId, onSuccessMessage, onErrorMessage, setSelectedGroup]);

    const handleCreateNew = useCallback(() => {
        setSelectedGroup(null);
        setCurrentView('create');
        resetCreateGroup();
        onSuccessMessage('');
        onErrorMessage('');
    }, [setCurrentView, setSelectedGroup, resetCreateGroup, onSuccessMessage, onErrorMessage]);

    const handleCancelCreate = useCallback(() => {
        if (userGroups && userGroups.length > 0) {
            setSelectedGroup(userGroups[0].id);
        } else {
            setCurrentView('overview');
        }
        onSuccessMessage('');
        onErrorMessage('');
    }, [userGroups, setSelectedGroup, setCurrentView, onSuccessMessage, onErrorMessage]);

    const handleTabClick = useCallback((view: string) => {
        setCurrentView(view as 'overview' | 'group' | 'create');
        if (view === 'overview') {
            setSelectedGroup(null);
        }
        onSuccessMessage('');
        onErrorMessage('');
        announceToScreenReader(`${view === 'overview' ? 'Übersicht' : view} ausgewählt`);
    }, [setCurrentView, setSelectedGroup, onSuccessMessage, onErrorMessage]);

    // Memoize navigation items to prevent recreation
    const navigationItems = useMemo<string[]>(() => [
        'overview',
        ...(userGroups ? userGroups.map((g: Group) => `group-${g.id}`) : [])
    ], [userGroups]);

    // Memoize default active item
    const defaultActiveItem = useMemo(() =>
        currentView === 'overview' ? 'overview' : `group-${selectedGroupId}`,
    [currentView, selectedGroupId]);

    const { getItemProps } = useRovingTabindex({
        items: navigationItems,
        defaultActiveItem
    });

    // Memoize tab index configs to prevent object recreation
    const overviewTabIndex = useMemo(() => ({
        createGroupButton: tabIndex.get?.('createGroupButton') ?? 1
    }), [tabIndex]);

    const createTabIndex = useMemo(() => ({
        groupNameInput: tabIndex.get?.('groupNameInput') ?? 1,
        createSubmitButton: tabIndex.get?.('createSubmitButton') ?? 2,
        createCancelButton: tabIndex.get?.('createCancelButton') ?? 3
    }), [tabIndex]);

    const detailTabIndex = useMemo(() => ({
        groupDetailTabs: tabIndex.get?.('groupDetailTabs') ?? 1,
        groupNameEdit: tabIndex.get?.('groupNameEdit') ?? 5
    }), [tabIndex]);

    const renderNavigationPanel = () => (
        <nav
            className="profile-row-navigation"
            role="tablist"
            aria-label="Gruppen Navigation"
        >
            <button
                {...getItemProps('overview')}
                className={`profile-row-tab ${currentView === 'overview' ? 'active' : ''}`}
                onClick={() => handleTabClick('overview')}
                role="tab"
                aria-selected={currentView === 'overview'}
                aria-controls="overview-panel"
                id="overview-tab"
            >
                Übersicht
            </button>

            {userGroups && userGroups.map((group: Group) => (
                <button
                    key={group.id}
                    {...getItemProps(`group-${group.id}`)}
                    className={`profile-row-tab ${selectedGroupId === group.id ? 'active' : ''}`}
                    onClick={() => handleSelectGroup(group.id)}
                    role="tab"
                    aria-selected={selectedGroupId === group.id}
                    aria-controls={`group-${group.id}-panel`}
                    id={`group-${group.id}-tab`}
                    aria-label={`Gruppe ${group.name} ${group.isAdmin ? '(Admin)' : '(Mitglied)'}`}
                >
                    <span className="group-tab-avatar-small">{getGroupInitials(group.name)}</span>
                    <span className="group-tab-name">{group.name}</span>
                </button>
            ))}
        </nav>
    );

    const renderContentPanel = () => {
        if (currentView === 'overview') {
            return (
                <GroupsOverviewSection
                    userGroups={userGroups}
                    isCreatingGroup={isCreatingGroup}
                    onCreateNew={handleCreateNew}
                    tabIndex={overviewTabIndex}
                />
            );
        }

        if (currentView === 'create') {
            return (
                <FormProvider {...createGroupFormMethods}>
                    <GroupsCreateSection
                        control={createGroupControl}
                        Input={Input}
                        isCreatingGroup={isCreatingGroup}
                        isCreateGroupError={isCreateGroupError}
                        createGroupError={createGroupError}
                        onSubmit={handleCreateGroupSubmit(handleCreateGroupFormSubmit)}
                        onCancel={handleCancelCreate}
                        tabIndex={createTabIndex}
                    />
                </FormProvider>
            );
        }

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
            className="profile-content profile-single-column"
            initial={MOTION_CONFIG.initial}
            animate={MOTION_CONFIG.animate}
            transition={MOTION_CONFIG.transition}
        >
            {renderNavigationPanel()}
            <div className="profile-form-section">
                <div className="auth-form">
                    {renderContentPanel()}
                </div>
            </div>
        </motion.div>
    );
});

GroupsManagementView.displayName = 'GroupsManagementView';

export default GroupsManagementView;
