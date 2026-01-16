import React, { Suspense, lazy } from 'react';

// Hooks
import { useOptimizedAuth } from '../../../../../../hooks/useAuth';

// Lazy-loaded components for performance
const ContentManagementView = lazy(() => import('./ContentManagementView'));

// Loading fallback component
const ContentManagementLoadingFallback = (): React.ReactElement => (
    <div className="profile-tab-loading">
    </div>
);

interface ContentManagementTabContainerProps {
    isActive: boolean;
    onSuccessMessage: (message: string) => void;
    onErrorMessage: (message: string) => void;
    initialTab?: string;
    canvaSubsection?: string;
    onTabChange?: (tab: string, subsection?: string) => void;
}

const ContentManagementTabContainer = ({
    isActive,
    onSuccessMessage,
    onErrorMessage
}: ContentManagementTabContainerProps): React.ReactElement => {
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
            />
        </Suspense>
    );
};

export default ContentManagementTabContainer;
