import { Suspense, lazy } from 'react';
import { useOptimizedAuth } from '../../../../../../hooks/useAuth';

const SitesView = lazy(() => import('./SitesView'));

const SitesLoadingFallback = () => (
    <div className="profile-tab-loading">
        Lädt...
    </div>
);

const SitesTabContainer = ({ isActive, onSuccessMessage, onErrorMessage }) => {
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