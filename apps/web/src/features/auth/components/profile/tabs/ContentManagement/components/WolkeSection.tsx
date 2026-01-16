import { memo } from 'react';

// Wolke components
import WolkeShareLinkManager from '../../../../../../wolke/components/WolkeShareLinkManager';

// Wolke Integration CSS - Loaded only when this feature is accessed
import '../../../../../../../assets/styles/features/wolke/wolke.css';

interface WolkeSectionProps {
    isActive: boolean;
    onSuccessMessage: (message: string) => void;
    onErrorMessage: (message: string) => void;
}

const WolkeSection = memo(({
    isActive,
    onSuccessMessage,
    onErrorMessage
}: WolkeSectionProps): React.ReactElement => {
    return (
        <div className="wolke-integration-section">
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
        </div>
    );
});

WolkeSection.displayName = 'WolkeSection';

export default WolkeSection;
