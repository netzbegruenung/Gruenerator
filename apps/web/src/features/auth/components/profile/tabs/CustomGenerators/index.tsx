import React, { Suspense, lazy } from 'react';

// Hooks
import { useOptimizedAuth } from '../../../../../../hooks/useAuth';
import { useBetaFeatures } from '../../../../../../hooks/useBetaFeatures';

// Lazy-loaded components for performance
const CustomGeneratorsView = lazy(() => import('./CustomGeneratorsView'));

// Loading fallback component
const CustomGeneratorsLoadingFallback = (): React.ReactElement => (
    <div className="profile-tab-loading">
    </div>
);

interface CustomGeneratorsTabContainerProps {
    isActive: boolean;
    onSuccessMessage: (message: string) => void;
    onErrorMessage: (message: string) => void;
    initialTab?: string;
    initialGeneratorId?: string | null;
    initialQAId?: string | null;
    onTabChange?: (tab: string) => void;
}

const CustomGeneratorsTabContainer = ({
    isActive,
    onSuccessMessage,
    onErrorMessage,
    initialTab = 'overview',
    initialGeneratorId = null,
    initialQAId = null,
    onTabChange
}: CustomGeneratorsTabContainerProps): React.ReactElement => {
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
