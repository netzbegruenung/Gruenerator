import { useState, useEffect, useCallback } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
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

const GroupsManagementView = ({
    isActive,
    onSuccessMessage,
    onErrorMessage
}) => {
    const { user } = useOptimizedAuth();
    const tabIndex = useTabIndex('PROFILE_GROUPS');

    const {
        selectedGroupId,
        currentView,
        groupDetailView,
        hasInitialAutoSelection,
        setSelectedGroup,
        setCurrentView,
        setGroupDetailView,
        setHasInitialAutoSelection,
    } = useGroupsStore();

    const createGroupFormMethods = useForm({
        defaultValues: { groupName: '' },
        mode: 'onSubmit'
    });
    const { control: createGroupControl, reset: resetCreateGroup, handleSubmit: handleCreateGroupSubmit } = createGroupFormMethods;
    const { Input } = useFormFields();

    const {
        userGroups,
        createGroup,
        isCreatingGroup,
        isCreateGroupError,
        createGroupError,
        isDeleteGroupSuccess,
    } = useGroups({ isActive });

    const handleCreateGroupFormSubmit = useCallback((data) => {
        if (isCreatingGroup) return;

        const groupName = data.groupName?.trim() || 'unbenannte Gruppe';

        onSuccessMessage('');
        onErrorMessage('');
        createGroup(groupName, {
            onSuccess: (newGroup) => {
                setSelectedGroup(newGroup.id);
                setGroupDetailView('anweisungen-wissen');
                resetCreateGroup();
                onSuccessMessage(`Gruppe "${groupName}" erfolgreich erstellt!`);
            },
            onError: (error) => {
                onErrorMessage(error?.message || 'Gruppe konnte nicht erstellt werden.');
            }
        });
    }, [isCreatingGroup, onSuccessMessage, onErrorMessage, createGroup, setSelectedGroup, setGroupDetailView, resetCreateGroup]);

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
            const deletedGroupWasSelected = !userGroups.some(g => g.id === selectedGroupId);
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

    const handleSelectGroup = useCallback((groupId) => {
        if (selectedGroupId !== groupId) {
            onSuccessMessage('');
            onErrorMessage('');
            setSelectedGroup(groupId);
            setGroupDetailView('anweisungen-wissen');
        }
    }, [selectedGroupId, onSuccessMessage, onErrorMessage, setSelectedGroup, setGroupDetailView]);

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

    const handleTabClick = useCallback((view) => {
        setCurrentView(view);
        if (view === 'overview') {
            setSelectedGroup(null);
        }
        onSuccessMessage('');
        onErrorMessage('');
        announceToScreenReader(`${view === 'overview' ? 'Übersicht' : view} ausgewählt`);
    }, [setCurrentView, setSelectedGroup, onSuccessMessage, onErrorMessage]);

    const navigationItems = [
        'overview',
        ...(userGroups ? userGroups.map(g => `group-${g.id}`) : [])
    ];

    const { getItemProps } = useRovingTabindex({
        items: navigationItems,
        defaultActiveItem: currentView === 'overview' ? 'overview' : `group-${selectedGroupId}`
    });

    const renderNavigationPanel = () => (
        <div className="profile-navigation-panel">
            <div
                className="profile-vertical-navigation"
                role="tablist"
                aria-label="Gruppen Navigation"
                aria-orientation="vertical"
            >
                <button
                    {...getItemProps('overview')}
                    className={`profile-vertical-tab ${currentView === 'overview' ? 'active' : ''}`}
                    onClick={() => handleTabClick('overview')}
                    role="tab"
                    aria-selected={currentView === 'overview'}
                    aria-controls="overview-panel"
                    id="overview-tab"
                >
                    Übersicht
                </button>

                {userGroups && userGroups.map(group => (
                    <button
                        key={group.id}
                        {...getItemProps(`group-${group.id}`)}
                        className={`profile-vertical-tab ${selectedGroupId === group.id ? 'active' : ''} ${group.isAdmin ? 'admin-group' : 'member-group'}`}
                        onClick={() => handleSelectGroup(group.id)}
                        role="tab"
                        aria-selected={selectedGroupId === group.id}
                        aria-controls={`group-${group.id}-panel`}
                        id={`group-${group.id}-tab`}
                        aria-label={`Gruppe ${group.name} ${group.isAdmin ? '(Admin)' : '(Mitglied)'}`}
                    >
                        <div className="group-tab-content">
                            <div className="group-tab-avatar">
                                {getGroupInitials(group.name)}
                            </div>
                            <div className="group-tab-info">
                                <div className="group-tab-name">{group.name}</div>
                                <div className="group-tab-badge">{group.isAdmin ? 'Admin' : 'Mitglied'}</div>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );

    const renderContentPanel = () => {
        if (currentView === 'overview') {
            return (
                <GroupsOverviewSection
                    userGroups={userGroups}
                    isCreatingGroup={isCreatingGroup}
                    onCreateNew={handleCreateNew}
                    tabIndex={tabIndex}
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
                        tabIndex={tabIndex}
                    />
                </FormProvider>
            );
        }

        if (currentView === 'group' && selectedGroupId) {
            return (
                <GroupDetailSection
                    groupId={selectedGroupId}
                    groupDetailView={groupDetailView}
                    setGroupDetailView={setGroupDetailView}
                    onSuccessMessage={onSuccessMessage}
                    onErrorMessage={onErrorMessage}
                    isActive={isActive}
                    tabIndex={tabIndex}
                />
            );
        }

        return (
            <GroupsOverviewSection
                userGroups={userGroups}
                isCreatingGroup={isCreatingGroup}
                onCreateNew={handleCreateNew}
                tabIndex={tabIndex}
            />
        );
    };

    return (
        <motion.div
            className="profile-content profile-management-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            {renderNavigationPanel()}
            <div className="profile-content-panel profile-form-section">
                <div className="group-content-card">
                    <div className="auth-form">
                        {renderContentPanel()}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default GroupsManagementView;
