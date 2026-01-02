import React, { Suspense, lazy } from 'react';

// Hooks
import { useOptimizedAuth } from '../../../../../../hooks/useAuth';

// Lazy-loaded components for performance
const ContentManagementView = lazy(() => import('./ContentManagementView'));

// Loading fallback component
const ContentManagementLoadingFallback = () => (
    <div className="profile-tab-loading">
    </div>
);

const ContentManagementTabContainer = ({
    isActive,
    onSuccessMessage,
    onErrorMessage,
    initialTab = 'inhalte',
    canvaSubsection = 'overview',
    onTabChange
}) => {
    const { user } = useOptimizedAuth();

    // Early return for non-authenticated users
    if (!user) {
        return (
            <div className="profile-tab-loading">
            </div>
        );
    }

    return (
        <Suspense fallback={<ContentManagementLoadingFallback />}>
            <ContentManagementView
                isActive={isActive}
                onSuccessMessage={onSuccessMessage}
                onErrorMessage={onErrorMessage}
                initialTab={initialTab}
                canvaSubsection={canvaSubsection}
                onTabChange={onTabChange}
            />
        </Suspense>
    );
};

export default ContentManagementTabContainer;
