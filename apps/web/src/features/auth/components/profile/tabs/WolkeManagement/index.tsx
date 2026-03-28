import React, { Suspense, lazy } from 'react';

import { useAuthStore } from '../../../../../../stores/authStore';

const WolkeManagementView = lazy(() => import('./WolkeManagementView'));

interface WolkeManagementTabContainerProps {
  isActive: boolean;
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
}

const WolkeManagementTabContainer = ({
  onSuccessMessage,
  onErrorMessage,
}: WolkeManagementTabContainerProps): React.ReactElement => {
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return <div className="profile-tab-loading" />;
  }

  return (
    <Suspense fallback={<div className="profile-tab-loading" />}>
      <WolkeManagementView onSuccessMessage={onSuccessMessage} onErrorMessage={onErrorMessage} />
    </Suspense>
  );
};

export default WolkeManagementTabContainer;
