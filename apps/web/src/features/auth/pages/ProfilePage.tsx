import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import Spinner from '../../../components/common/Spinner';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { PROFILE_MENU_ITEMS } from '../components/profile/ProfileMenu';

import '../../../assets/styles/features/auth/auth.css';
import '../../../assets/styles/features/auth/documents-tab.css';
import '../../../assets/styles/components/auth/avatar-selection.css';

const ProfileInfoTab = lazy(() => import('../components/profile/ProfileInfoTab'));
const GroupsManagementTab = lazy(() => import('../components/profile/tabs/GroupsManagement'));
const ContentManagementTab = lazy(() => import('../components/profile/tabs/ContentManagement'));

type TabMapping = Record<string, string>;

const ProfilePage = () => {
  const navigate = useNavigate();
  const { tab, subtab, subsubtab } = useParams();

  const { user, isLoggingOut, deleteAccount, canManageAccount } = useOptimizedAuth();

  const { shouldShowTab, canAccessBetaFeature } = useBetaFeatures();

  // Generate TAB_MAPPING from PROFILE_MENU_ITEMS
  const TAB_MAPPING: TabMapping = PROFILE_MENU_ITEMS.reduce<TabMapping>((acc, item) => {
    const urlPath = item.path.replace('/profile/', '') || 'profil';
    acc[urlPath === '' ? 'profil' : urlPath] = item.key;
    return acc;
  }, {});

  // Get active tab from URL path
  const activeTab = tab ? TAB_MAPPING[tab] || 'profile' : 'profile';

  // Message states
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Handle invalid tab URLs and redirects
  useEffect(() => {
    if (tab === 'dokumente' || tab === 'grafik' || tab === 'anweisungen' || tab === 'vorlagen') {
      navigate('/profile/inhalte', { replace: true });
      return;
    }

    if (tab === 'grueneratoren') {
      navigate('/texte?tab=eigene', { replace: true });
      return;
    }

    if (tab === 'integrationen' || tab === 'canva') {
      navigate('/profile/inhalte', { replace: true });
      return;
    }

    if (tab && !TAB_MAPPING[tab]) {
      navigate('/profile', { replace: true });
      return;
    }
  }, [tab, subtab, subsubtab, navigate, TAB_MAPPING, canAccessBetaFeature]);

  // Message timeout handling
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

  const handleSuccessMessage = useCallback((message: string) => {
    setErrorMessage('');
    setSuccessMessage(message);
  }, []);

  const handleErrorMessage = useCallback((message: string) => {
    setSuccessMessage('');
    setErrorMessage(message);
  }, []);

  if (isLoggingOut) {
    return (
      <div className="mx-auto max-w-screen-xl px-md py-lg">
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-md">
          <h1>Abmelden...</h1>
          <Spinner size="large" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-xl px-md py-lg">
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

      <div>
        <Suspense fallback={<div />}>
          {activeTab === 'profile' && (
            <ProfileInfoTab
              user={user || undefined}
              onSuccessMessage={handleSuccessMessage}
              onErrorProfileMessage={handleErrorMessage}
              deleteAccount={async (options: { confirm: string }) => {
                if (typeof deleteAccount === 'function') {
                  const result = (await deleteAccount({ confirm: options.confirm })) as {
                    success?: boolean;
                  } | void;
                  return {
                    success:
                      result && typeof result === 'object' && 'success' in result
                        ? (result.success ?? false)
                        : false,
                  };
                }
                return { success: false };
              }}
              canManageAccount={() =>
                typeof canManageAccount === 'function' ? canManageAccount() : !!canManageAccount
              }
            />
          )}

          {activeTab === 'inhalte' && (
            <ContentManagementTab
              onSuccessMessage={handleSuccessMessage}
              onErrorMessage={handleErrorMessage}
              isActive={activeTab === 'inhalte'}
            />
          )}

          {activeTab === 'gruppen' && shouldShowTab('groups') && (
            <GroupsManagementTab
              onSuccessMessage={handleSuccessMessage}
              onErrorMessage={handleErrorMessage}
              isActive={activeTab === 'gruppen'}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default withAuthRequired(ProfilePage, {
  title: 'Profil',
  message: 'Melde dich an, um dein Profil zu verwalten und eigene Grüneratoren zu erstellen.',
});
