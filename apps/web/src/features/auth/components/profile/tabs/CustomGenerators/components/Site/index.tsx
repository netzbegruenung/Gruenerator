import { Suspense, lazy } from 'react';
import { useOptimizedAuth } from '../../../../../../../../hooks/useAuth';

const SitesView = lazy(() => import('./SitesView'));

const SitesLoadingFallback = (): React.ReactElement => (
    <div className="profile-tab-loading">
        Lädt...
    </div>
);

interface SitesTabContainerProps {
    isActive: boolean;
    onSuccessMessage: (message: string) => void;
    onErrorMessage: (message: string) => void;
}

const SitesTabContainer = ({ isActive, onSuccessMessage, onErrorMessage }: SitesTabContainerProps): React.ReactElement => {
    const { user } = useOptimizedAuth();

    if (!user) {
        return (
            <div className="profile-tab-loading">
                <div>Benutzerinformationen werden geladen...</div>
            </div>
        );
    }

    return (
        <Suspense fallback={<SitesLoadingFallback />}>
            <SitesView
                isActive={isActive}
                onSuccessMessage={onSuccessMessage}
                onErrorMessage={onErrorMessage}
            />
        </Suspense>
    );
};

export default SitesTabContainer;
