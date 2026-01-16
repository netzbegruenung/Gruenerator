import { memo } from 'react';
import { motion } from "motion/react";
import type { Control } from 'react-hook-form';

interface TabIndexConfig {
    groupNameInput?: number;
    createSubmitButton?: number;
    createCancelButton?: number;
}

interface GroupsCreateSectionProps {
    control: Control<{ groupName: string }>;
    Input: React.ComponentType<{
        name: string;
        type: string;
        label: string;
        placeholder: string;
        rules?: Record<string, unknown>;
        disabled?: boolean;
        control: Control<{ groupName: string }>;
        tabIndex?: number;
    }>;
    isCreatingGroup: boolean;
    isCreateGroupError: boolean;
    createGroupError: Error | null;
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    onCancel: () => void;
    tabIndex: TabIndexConfig;
}

// Static motion config moved outside component
const MOTION_CONFIG = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.3 }
} as const;

// Static validation rules moved outside component
const GROUP_NAME_RULES = {
    maxLength: { value: 100, message: 'Gruppenname darf maximal 100 Zeichen haben' }
} as const;

const GroupsCreateSection = memo(({
    control,
    Input,
    isCreatingGroup,
    isCreateGroupError,
    createGroupError,
    onSubmit,
    onCancel,
    tabIndex
}: GroupsCreateSectionProps): React.ReactElement => {
    return (
        <motion.div
            className="group-create-container"
            initial={MOTION_CONFIG.initial}
            animate={MOTION_CONFIG.animate}
            transition={MOTION_CONFIG.transition}
        >
            <div className="group-content-card">
                <div className="group-info-panel">
                    <div className="group-header-section">
                        <div className="group-title-area">
                            <h2 className="profile-user-name large-profile-title">Neue Gruppe erstellen</h2>
                        </div>
                    </div>

                    {isCreateGroupError && (
                        <div className="auth-error-message error-margin">
                            {createGroupError?.message || 'Fehler beim Erstellen der Gruppe'}
                        </div>
                    )}

                    <form onSubmit={onSubmit} className="auth-form">
                        <div className="form-group">
                            <div className="form-field-wrapper">
                                <Input
                                    name="groupName"
                                    type="text"
                                    label="Gruppenname:"
                                    placeholder="Name der neuen Gruppe (optional - falls leer: 'unbenannte Gruppe')"
                                    rules={GROUP_NAME_RULES}
                                    disabled={isCreatingGroup}
                                    control={control}
                                    tabIndex={tabIndex.groupNameInput}
                                />
                            </div>
                        </div>
                        <div className="profile-actions">
                            <button
                                type="submit"
                                className="btn-primary size-m"
                                disabled={isCreatingGroup}
                                tabIndex={tabIndex.createSubmitButton}
                            >
                                Gruppe erstellen
                            </button>
                            <button
                                type="button"
                                onClick={onCancel}
                                className="btn-primary size-m"
                                disabled={isCreatingGroup}
                                tabIndex={tabIndex.createCancelButton}
                            >
                                Abbrechen
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </motion.div>
    );
});

GroupsCreateSection.displayName = 'GroupsCreateSection';

export default GroupsCreateSection;
