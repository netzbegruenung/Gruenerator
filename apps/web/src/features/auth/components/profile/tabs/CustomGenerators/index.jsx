import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';

// Hooks
import { useOptimizedAuth } from '../../../../../../hooks/useAuth';
import { useBetaFeatures } from '../../../../../../hooks/useBetaFeatures';

// Lazy-loaded components for performance
const CustomGeneratorsView = lazy(() => import('./CustomGeneratorsView'));

// Loading fallback component
const CustomGeneratorsLoadingFallback = () => (
    <div className="profile-tab-loading">
    </div>
);

const CustomGeneratorsTabContainer = ({ 
    isActive,
    onSuccessMessage, 
    onErrorMessage,
    initialTab = 'overview',
    initialGeneratorId = null,
    initialQAId = null,
    onTabChange
}) => {
    const { user, isAuthenticated } = useOptimizedAuth();
    const { canAccessBetaFeature } = useBetaFeatures();

    // Early return for non-authenticated users
    if (!user) {
        return (
            <div className="profile-tab-loading">
                <div>Benutzerinformationen werden geladen...</div>
            </div>
        );
    }

    return (
        <Suspense fallback={<CustomGeneratorsLoadingFallback />}>
            <CustomGeneratorsView
                isActive={isActive}
                onSuccessMessage={onSuccessMessage}
                onErrorMessage={onErrorMessage}
                initialTab={initialTab}
                initialGeneratorId={initialGeneratorId}
                initialQAId={initialQAId}
                onTabChange={onTabChange}
            />
        </Suspense>
    );
};

export default CustomGeneratorsTabContainer;