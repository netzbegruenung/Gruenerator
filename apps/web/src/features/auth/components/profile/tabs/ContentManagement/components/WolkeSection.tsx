// Wolke components
import WolkeShareLinkManager from '../../../../../../wolke/components/WolkeShareLinkManager';

// Wolke Integration CSS - Loaded only when this feature is accessed
import '../../../../../../../assets/styles/features/wolke/wolke.css';

// Hooks
import { useOptimizedAuth } from '../../../../../../../hooks/useAuth';

interface WolkeSectionProps {
    isActive: boolean;
    onSuccessMessage: (message: string) => void;
    onErrorMessage: (message: string) => void;
}

const WolkeSection = ({
    isActive,
    onSuccessMessage,
    onErrorMessage
}: WolkeSectionProps): React.ReactElement => {
    // Auth state (kept in case we want to guard rendering)
    const { isAuthenticated } = useOptimizedAuth();

    // =====================================================================
    // RENDER METHODS
    // =====================================================================

    // Render Wolke content
    const renderWolkeContent = () => (
        <div
            role="tabpanel"
            id="wolke-panel"
            aria-labelledby="wolke-tab"
            tabIndex={-1}
        >
            <WolkeShareLinkManager
                useStore={true}
                onSuccessMessage={onSuccessMessage}
                onErrorMessage={onErrorMessage}
            />
        </div>
    );

    return (
        <div className="wolke-integration-section">
            {renderWolkeContent()}
        </div>
    );
};

export default WolkeSection;
