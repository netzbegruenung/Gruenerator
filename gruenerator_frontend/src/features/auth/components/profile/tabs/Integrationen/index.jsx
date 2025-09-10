import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';

// Hooks
import { useOptimizedAuth } from '../../../../../../hooks/useAuth';
import { useBetaFeatures } from '../../../../../../hooks/useBetaFeatures';

// Lazy-loaded components for performance
const IntegrationenView = lazy(() => import('./IntegrationenView'));


const IntegrationenTabContainer = ({ 
    isActive,
    onSuccessMessage, 
    onErrorMessage,
    initialTab = 'canva',
    canvaSubsection = 'overview',
    onTabChange
}) => {
    const { user, isAuthenticated } = useOptimizedAuth();
    const { canAccessBetaFeature } = useBetaFeatures();

    // Early return for non-authenticated users
    if (!user) {
        return null;
    }

    // Note: Wolke is available to all authenticated users, while Canva
    // is gated behind a beta flag. Do not block the entire tab when Canva
    // is unavailable, so users can still access Wolke.

    return (
        <Suspense fallback={null}>
            <IntegrationenView
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

export default IntegrationenTabContainer;
