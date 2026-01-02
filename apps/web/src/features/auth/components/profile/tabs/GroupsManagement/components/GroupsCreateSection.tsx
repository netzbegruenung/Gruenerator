import { motion } from "motion/react";

const GroupsCreateSection = ({
    control,
    Input,
    isCreatingGroup,
    isCreateGroupError,
    createGroupError,
    onSubmit,
    onCancel,
    tabIndex
}) => {
    return (
        <motion.div
            className="group-create-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
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
                                    rules={{
                                        maxLength: { value: 100, message: 'Gruppenname darf maximal 100 Zeichen haben' }
                                    }}
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
};

export default GroupsCreateSection;
