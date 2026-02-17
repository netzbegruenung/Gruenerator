import React, { Suspense, lazy } from 'react';

// Hooks
import { useOptimizedAuth } from '../../../../../../hooks/useAuth';

// Lazy-loaded components for performance
const ContentManagementView = lazy(() => import('./ContentManagementView'));

// Loading fallback component
const ContentManagementLoadingFallback = (): React.ReactElement => (
  <div className="profile-tab-loading" />
);

interface ContentManagementTabContainerProps {
  isActive: boolean;
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
  initialTab?: string;
  onTabChange?: (tab: string) => void;
}

const ContentManagementTabContainer = ({
  isActive,
  onSuccessMessage,
  onErrorMessage,
}: ContentManagementTabContainerProps): React.ReactElement => {
  const { user } = useOptimizedAuth();

  // Early return for non-authenticated users
  if (!user) {
    return <div className="profile-tab-loading" />;
  }

  return (
    <Suspense fallback={<ContentManagementLoadingFallback />}>
      <ContentManagementView
        isActive={isActive}
        onSuccessMessage={onSuccessMessage}
        onErrorMessage={onErrorMessage}
      />
    </Suspense>
  );
};

export default ContentManagementTabContainer;
