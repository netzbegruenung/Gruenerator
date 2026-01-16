import { HiInformationCircle } from 'react-icons/hi';
import type { Control } from 'react-hook-form';
import { InstructionsGrid } from '../../../../../../../../components/common/InstructionFields';
import '../../../../../../../../assets/styles/features/groups/groups.css';

interface GroupData {
    isAdmin?: boolean;
    [key: string]: unknown;
}

interface GroupInstructionsSectionProps {
    data: GroupData | null;
    control: Control<Record<string, unknown>>;
    GROUP_MAX_CONTENT_LENGTH: number;
    enabledFields?: string[];
    onAddField: (field: string) => void;
    onRemoveField: (field: string) => void;
}

const GroupInstructionsSection = ({
    data,
    control,
    GROUP_MAX_CONTENT_LENGTH,
    enabledFields = [],
    onAddField,
    onRemoveField
}: GroupInstructionsSectionProps): React.ReactElement => {
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
                        data={data ?? undefined}
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
