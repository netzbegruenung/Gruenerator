import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from "motion/react";
import { HiInformationCircle, HiArrowRight, HiCheckCircle, HiXCircle } from 'react-icons/hi';

// Common components
import { ProfileIconButton, ProfileActionButton } from '../../../../../../../components/profile/actions/ProfileActionButton';
import EditableDetailForm from '../../shared/EditableDetailForm';
import useEditableDetail from '../../shared/useEditableDetail';

// Import ProfileActionButton CSS
import '../../../../../../../assets/styles/components/profile/profile-action-buttons.css';

// Hooks
// No data hook here; mutations are passed down from parent
import { useTabIndex } from '../../../../../../../hooks/useTabIndex';

const GeneratorDetail = ({ 
    isActive,
    onSuccessMessage, 
    onErrorMessage,
    generatorId,
    onBack,
    generators,
    // Optional: pass mutations from parent to avoid duplicate hooks
    updateGenerator: updateGeneratorProp,
    deleteGenerator: deleteGeneratorProp,
    isUpdating: isUpdatingProp,
    isDeleting: isDeletingProp,
}) => {
    // Tab index configuration
    const tabIndex = useTabIndex('PROFILE_GENERATORS');
    
    // Use centralized hooks
    // Mutations come from parent (single source of truth)
    const updateGenerator = updateGeneratorProp;
    const deleteGenerator = deleteGeneratorProp;
    const isReactQueryUpdating = !!isUpdatingProp;
    const isDeleting = !!isDeletingProp;

    // Find the current generator (robust to type differences)
    const generator = (generators || []).find(g => String(g.id) === String(generatorId));
    
    // Use shared editable detail hook
    const editableDetail = useEditableDetail({
        entityId: generatorId,
        entity: generator,
        updateFn: updateGenerator,
        onSuccessMessage,
        onErrorMessage,
        entityType: 'generator'
    });
    // Combine loading states for backward compatibility
    const isUpdating = isReactQueryUpdating || editableDetail.isLoading;

    // Handle delete generator
    const handleDeleteGenerator = async () => {
        if (!generator) return;
        
        if (!window.confirm('Möchten Sie diesen Grünerator wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
            return;
        }

        onErrorMessage('');
        onSuccessMessage('');

        try {
            await deleteGenerator(generatorId);
            onSuccessMessage('Grünerator erfolgreich gelöscht.');
            onBack();
        } catch (err) {
            // Error already handled by useCustomGenerators hook
        }
    };


    // Generator not found
    if (!generator) {
        return (
            <div className="profile-content-card centered-content-card">
                <HiInformationCircle size={48} className="info-icon" />
                <h3>Custom Grünerator nicht gefunden</h3>
                <p>Der ausgewählte Custom Grünerator ist nicht mehr verfügbar. Möglicherweise wurde er gelöscht.</p>
                <ProfileActionButton 
                    action="back"
                    onClick={onBack}
                />
            </div>
        );
    }

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
                        <h3 className="profile-user-name medium-profile-title">
                            {generator.title || generator.name}
                        </h3>
                    </div>
                    <div className="custom-generator-actions">
                        <Link 
                            to={`/gruenerator/${generator.slug}`} 
                            className="pabtn pabtn--ghost pabtn--s"
                            title="Öffnen"
                            tabIndex={tabIndex.openButton}
                            aria-label={`Custom Grünerator ${generator.title || generator.name} öffnen`}
                        >
                            <HiArrowRight className="pabtn__icon" />
                        </Link>
                        {!editableDetail.isEditing && (
                            <ProfileIconButton
                                action="edit"
                                variant="ghost"
                                onClick={editableDetail.startEdit}
                                disabled={isUpdating || isDeleting}
                                title="Bearbeiten"
                                ariaLabel={`Custom Grünerator ${generator.title || generator.name} bearbeiten`}
                            />
                        )}
                        <ProfileIconButton
                            action="delete"
                            variant="ghost"
                            onClick={handleDeleteGenerator}
                            disabled={isDeleting || isUpdating}
                            title="Löschen"
                            ariaLabel={`Custom Grünerator ${generator.title || generator.name} löschen`}
                        />
                    </div>
                </div>

                <div className="generator-info-grid">
                    {generator.description && (
                        <>
                            <span className="generator-info-label">Beschreibung</span>
                            <span className="generator-info-value">{generator.description}</span>
                        </>
                    )}
                    <span className="generator-info-label">Interner Name</span>
                    <span className="generator-info-value">{generator.name}</span>
                    <span className="generator-info-label">URL</span>
                    <span className="generator-info-value">/gruenerator/{generator.slug}</span>
                    {generator.contact_email && (
                        <>
                            <span className="generator-info-label">Kontakt</span>
                            <span className="generator-info-value">{generator.contact_email}</span>
                        </>
                    )}
                </div>
            </div>

            <hr className="form-divider-large" />
            
            <div className="generator-details-content">
                {editableDetail.isEditing ? (
                    <EditableDetailForm
                        entityType="generator"
                        getDisplayValue={editableDetail.getDisplayValue}
                        updateField={editableDetail.updateField}
                        onSave={editableDetail.saveEdit}
                        onCancel={editableDetail.cancelEdit}
                        isLoading={editableDetail.isLoading}
                    />
                ) : (
                    // Display Mode
                    <>
                        {editableDetail.getDisplayValue('form_schema') && 
                         editableDetail.getDisplayValue('form_schema').fields && 
                         Array.isArray(editableDetail.getDisplayValue('form_schema').fields) && 
                         editableDetail.getDisplayValue('form_schema').fields.length > 0 && (
                            <div className="generator-form-fields">
                                <h4>Formularfelder</h4>
                                {editableDetail.getDisplayValue('form_schema').fields.map((field, index) => (
                                    <div key={index} className="field-item">
                                        <div className="field-header">
                                            <span className="field-name">{field.label || field.name}</span>
                                            <span className={`field-required ${field.required ? 'required' : 'optional'}`}>
                                                {field.required ? (
                                                    <>
                                                        <HiCheckCircle size={14} />
                                                        Pflichtfeld
                                                    </>
                                                ) : (
                                                    <>
                                                        <HiXCircle size={14} />
                                                        Optional
                                                    </>
                                                )}
                                            </span>
                                        </div>
                                        <div className="field-details">
                                            <span>
                                                Typ: {field.type === 'textarea' 
                                                    ? 'Langer Text' 
                                                    : field.type === 'select'
                                                    ? 'Auswahlfeld'
                                                    : (field.type === 'text' ? 'Kurzer Text' : field.type)
                                                }
                                            </span>
                                            {field.placeholder && (
                                                <span>Platzhalter: "{field.placeholder}"</span>
                                            )}
                                            {field.type === 'select' && field.options && field.options.length > 0 && (
                                                <span>
                                                    Optionen: {field.options.map(opt => opt.label).join(', ')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {generator.prompt && (
                            <div>
                                <h4>Prompt-Vorlage</h4>
                                <div className="prompt-container">
                                    <div className="prompt-content">{generator.prompt}</div>
                                </div>
                            </div>
                        )}

                        {!((editableDetail.getDisplayValue('form_schema') && 
                           editableDetail.getDisplayValue('form_schema').fields && 
                           Array.isArray(editableDetail.getDisplayValue('form_schema').fields) && 
                           editableDetail.getDisplayValue('form_schema').fields.length > 0) || 
                           generator.prompt) && (
                            <p>Für diesen Grünerator sind keine detaillierten Feld- oder Prompt-Informationen verfügbar.</p>
                        )}
                    </>
                )}

            </div>
        </motion.div>
    );
};

export default GeneratorDetail;
