import { HiInformationCircle } from 'react-icons/hi';
import { InstructionsGrid } from '../../../../../../../../components/common/InstructionFields';
import '../../../../../../../../assets/styles/features/groups/groups.css';

const GroupInstructionsSection = ({
    data,
    control,
    GROUP_MAX_CONTENT_LENGTH,
    enabledFields = [],
    onAddField,
    onRemoveField
}) => {
    const isAdmin = data?.isAdmin;

    return (
        <>
            {!isAdmin && (
                <div className="group-readonly-notice">
                    <HiInformationCircle className="group-readonly-notice-icon" />
                    <div className="group-readonly-notice-content">
                        <div className="group-readonly-notice-title">Nur-Lesen-Modus</div>
                        <p className="group-readonly-notice-text">
                            Du kannst die Gruppeninhalte einsehen, aber nur Gruppenadministratoren können sie bearbeiten.
                        </p>
                    </div>
                </div>
            )}

            <div className="group-content-card">
                <div className="auth-form">
                    <InstructionsGrid
                        control={control}
                        data={data}
                        isReadOnly={!isAdmin}
                        labelPrefix="Gruppen"
                        maxLength={GROUP_MAX_CONTENT_LENGTH}
                        showCharacterCount={true}
                        enabledFields={enabledFields}
                        onAddField={onAddField}
                        onRemoveField={onRemoveField}
                    />

                    {isAdmin && (
                        <div className="form-help-text">
                            Änderungen werden automatisch gespeichert
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default GroupInstructionsSection;
