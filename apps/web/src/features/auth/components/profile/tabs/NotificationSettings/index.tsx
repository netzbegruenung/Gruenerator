import React, { Suspense, lazy } from 'react';

import { useOptimizedAuth } from '../../../../../../hooks/useAuth';

const NotificationSettingsView = lazy(() => import('./NotificationSettingsView'));

interface NotificationSettingsTabProps {
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
}

const NotificationSettingsTab = ({
  onSuccessMessage,
  onErrorMessage,
}: NotificationSettingsTabProps): React.ReactElement => {
  const { user } = useOptimizedAuth();

  if (!user) {
    return <div className="profile-tab-loading" />;
  }

  return (
    <Suspense fallback={<div className="profile-tab-loading" />}>
      <NotificationSettingsView
        onSuccessMessage={onSuccessMessage}
        onErrorMessage={onErrorMessage}
      />
    </Suspense>
  );
};

export default NotificationSettingsTab;
