import { motion } from "motion/react";
import { HiArrowLeft } from 'react-icons/hi';

// Import the existing Create Custom Generator Page for reuse
import CreateCustomGeneratorPage from '../../../../../../generators/CreateCustomGeneratorPage';

// Common components
import { ProfileIconButton } from '../../../../../../../components/profile/actions/ProfileActionButton';

const GeneratorCreator = ({
    onCompleted,
    onCancel,
    onSuccessMessage,
    onErrorMessage
}) => {

    return (
        <motion.div
            className="profile-content-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="profile-info-panel">
                <div className="profile-header-section">
                    <div className="group-title-area">
                        <button
                            onClick={onCancel}
                            className="back-button"
                            aria-label="Zurück zur Übersicht"
                            title="Zurück zur Übersicht"
                        >
                            <HiArrowLeft />
                        </button>
                        <h3 className="profile-user-name medium-profile-title">
                            Neuen Custom Grünerator erstellen
                        </h3>
                    </div>
                </div>

                {/* Embed the existing creation flow without global header/footer */}
                <div style={{ paddingTop: '0.5rem' }}>
                    <CreateCustomGeneratorPage
                        onCompleted={onCompleted}
                        onCancel={onCancel}
                    />
                </div>
            </div>
        </motion.div>
    );
};

export default GeneratorCreator;
