import { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import { useGroups } from '../hooks/useGroups';
import { useGroupPresenceManager } from '../hooks/useGroupPresenceManager';
import { useOptimizedAuth } from '../../../hooks/useAuth';

import GroupDetailSection from '../components/GroupDetailSection';
import GroupsCreateSection from '../components/GroupsCreateSection';
import GroupsOverviewSection from '../components/GroupsOverviewSection';

interface Group {
  id: string;
  name: string;
  isAdmin?: boolean;
}

const GruppenPage = () => {
  const navigate = useNavigate();
  const { groupId } = useParams<{ groupId?: string }>();
  const { user } = useOptimizedAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const {
    userGroups,
    createGroup,
    isCreatingGroup,
    isCreateGroupError,
    createGroupError,
    isDeleteGroupSuccess,
  } = useGroups({ isActive: true });

  const groupIds = useMemo(
    () => (userGroups || []).map((g: Group) => g.id),
    [userGroups]
  );
  const presenceUser = user ? { id: user.id, name: user.display_name || user.email || 'User' } : null;
  const { getOnlineCount } = useGroupPresenceManager(groupId ? [] : groupIds, presenceUser);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(''), 7000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  useEffect(() => {
    if (isDeleteGroupSuccess && groupId && userGroups) {
      const deletedGroupWasSelected = !userGroups.some((g: Group) => g.id === groupId);
      if (deletedGroupWasSelected) {
        setSuccessMessage('Gruppe erfolgreich gelöscht!');
        navigate('/gruppen', { replace: true });
      }
    }
  }, [isDeleteGroupSuccess, groupId, userGroups, navigate]);

  const handleSelectGroup = useCallback(
    (id: string) => {
      navigate(`/gruppen/${id}`);
    },
    [navigate]
  );

  const handleCreateNew = useCallback(() => {
    setCreateDialogOpen(true);
    setSuccessMessage('');
    setErrorMessage('');
  }, []);

  const handleCreateGroup = useCallback(
    (groupName: string) => {
      if (isCreatingGroup) return;
      const name = groupName.trim() || 'unbenannte Gruppe';
      setSuccessMessage('');
      setErrorMessage('');
      createGroup(name, {
        onSuccess: (newGroup: Group) => {
          setCreateDialogOpen(false);
          setSuccessMessage(`Gruppe "${name}" erfolgreich erstellt!`);
          navigate(`/gruppen/${newGroup.id}`);
        },
        onError: (error: Error | null) => {
          setErrorMessage(error?.message || 'Gruppe konnte nicht erstellt werden.');
        },
      });
    },
    [isCreatingGroup, createGroup, navigate]
  );

  return (
    <PageContainer
      title={groupId ? undefined : 'Gruppen'}
      subtitle={groupId ? undefined : 'Verwalte deine Gruppen, Mitglieder und geteilte Inhalte.'}
      maxWidth="sm"
    >
      {(successMessage || errorMessage) && (
        <div className="mb-md">
          {successMessage && (
            <div className="rounded-md border border-green-200 bg-green-50 p-md text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
              {successMessage}
            </div>
          )}
          {errorMessage && (
            <div className="rounded-md border border-red-200 bg-red-50 p-md text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {errorMessage}
            </div>
          )}
        </div>
      )}

      {groupId ? (
        <GroupDetailSection
          groupId={groupId}
          onSuccessMessage={setSuccessMessage}
          onErrorMessage={setErrorMessage}
        />
      ) : (
        <GroupsOverviewSection
          userGroups={userGroups}
          isCreatingGroup={isCreatingGroup}
          onCreateNew={handleCreateNew}
          onSelectGroup={handleSelectGroup}
          tabIndex={{ createGroupButton: 1 }}
          getOnlineCount={getOnlineCount}
        />
      )}

      <GroupsCreateSection
        isOpen={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreateGroup={handleCreateGroup}
        isCreatingGroup={isCreatingGroup}
        isCreateGroupError={isCreateGroupError}
        createGroupError={createGroupError}
      />
    </PageContainer>
  );
};

export default withAuthRequired(GruppenPage, { title: 'Gruppen' });
