import { StatusBanner } from '@gruenerator/ui';
import { useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import GroupDetailSection from '../components/GroupDetailSection';
import GroupsCreateSection from '../components/GroupsCreateSection';
import GroupsOverviewSection from '../components/GroupsOverviewSection';
import { useGroups, type GroupSummary } from '../hooks/useGroups';

const GruppenPage = () => {
  const navigate = useNavigate();
  const { groupId } = useParams<{ groupId?: string }>();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { userGroups, createGroup, isCreatingGroup, isCreateGroupError, createGroupError } =
    useGroups({ isActive: true });

  const showSuccess = useCallback((msg: string) => {
    if (successTimer.current) clearTimeout(successTimer.current);
    setSuccessMessage(msg);
    successTimer.current = setTimeout(() => setSuccessMessage(''), 5000);
  }, []);

  const showError = useCallback((msg: string) => {
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setErrorMessage(msg);
    errorTimer.current = setTimeout(() => setErrorMessage(''), 7000);
  }, []);

  const handleCreateNew = useCallback(() => {
    setCreateDialogOpen(true);
    setSuccessMessage('');
    setErrorMessage('');
  }, []);

  const handleCreateGroup = useCallback(
    (groupName: string) => {
      if (isCreatingGroup) return;
      const name = groupName.trim();
      setSuccessMessage('');
      setErrorMessage('');
      createGroup(name, {
        onSuccess: (newGroup: GroupSummary) => {
          setCreateDialogOpen(false);
          showSuccess(`Gruppe "${name}" erfolgreich erstellt!`);
          navigate(`/gruppen/${newGroup.id}`);
        },
        onError: (error: Error | null) => {
          showError(error?.message || 'Gruppe konnte nicht erstellt werden.');
        },
      });
    },
    [isCreatingGroup, createGroup, navigate, showSuccess, showError]
  );

  return (
    <PageContainer
      {...(!groupId && {
        title: 'Gruppen',
        subtitle: 'Verwalte deine Gruppen, Mitglieder und geteilte Inhalte.',
      })}
      maxWidth="sm"
    >
      {(successMessage || errorMessage) && (
        <div className="mb-md">
          {successMessage && <StatusBanner variant="success">{successMessage}</StatusBanner>}
          {errorMessage && <StatusBanner variant="error">{errorMessage}</StatusBanner>}
        </div>
      )}

      {groupId ? (
        <GroupDetailSection
          key={groupId}
          groupId={groupId}
          onSuccessMessage={showSuccess}
          onErrorMessage={showError}
        />
      ) : (
        <GroupsOverviewSection
          userGroups={userGroups}
          isCreatingGroup={isCreatingGroup}
          onCreateNew={handleCreateNew}
          tabIndex={{ createGroupButton: 1 }}
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
