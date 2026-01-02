import { HiInformationCircle } from 'react-icons/hi';
import WolkeShareLinkManager from '../../../../../../../../features/wolke/components/WolkeShareLinkManager';

const GroupWolkeSection = ({
    isAdmin,
    permissions
}) => {
    return (
        <>
            {/* Read-only notification for non-admin members */}
            {!isAdmin && (
                <div className="group-readonly-notice">
                    <HiInformationCircle className="group-readonly-notice-icon" />
                    <div className="group-readonly-notice-content">
                        <div className="group-readonly-notice-title">Eingeschränkter Zugriff</div>
                        <p className="group-readonly-notice-text">
                            Du kannst die Wolke-Ordner einsehen, aber nur Gruppenadministratoren können sie bearbeiten.
                        </p>
                    </div>
                </div>
            )}

            <div className="group-content-card">
                <WolkeShareLinkManager
                    useStore={true}
                    readOnly={!permissions.canAddLinks || !permissions.canDeleteLinks}
                />
            </div>
        </>
    );
};

export default GroupWolkeSection;
