import React, { Suspense, lazy } from 'react';

import { useOptimizedAuth } from '../../../../../../hooks/useAuth';
import { useBetaFeatures } from '../../../../../../hooks/useBetaFeatures';

const GroupsManagementView = lazy(() => import('./GroupsManagementView'));

const GroupsManagementLoadingFallback = () => (
    <div className="profile-tab-loading">
    </div>
);

const GroupsManagementTabContainer = ({
    isActive,
    onSuccessMessage,
    onErrorMessage
}) => {
    const { user } = useOptimizedAuth();
    const { canAccessBetaFeature, isLoading: isBetaLoading } = useBetaFeatures();

    if (isBetaLoading) {
        return <GroupsManagementLoadingFallback />;
    }

    if (!canAccessBetaFeature('groups')) {
        return null;
    }

    if (!user) {
        return <GroupsManagementLoadingFallback />;
    }

    return (
        <Suspense fallback={<GroupsManagementLoadingFallback />}>
            <GroupsManagementView
                isActive={isActive}
                onSuccessMessage={onSuccessMessage}
                onErrorMessage={onErrorMessage}
            />
        </Suspense>
    );
};

export default GroupsManagementTabContainer;
