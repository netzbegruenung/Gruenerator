import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';

// Hooks
import { useOptimizedAuth } from '../../../../../../hooks/useAuth';
import { useBetaFeatures } from '../../../../../../hooks/useBetaFeatures';

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
    initialTab = 'dokumente',
    onTabChange
}) => {
    const { user, isAuthenticated } = useOptimizedAuth();
    const { canAccessBetaFeature } = useBetaFeatures();

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
                onTabChange={onTabChange}
            />
        </Suspense>
    );
};

export default ContentManagementTabContainer;