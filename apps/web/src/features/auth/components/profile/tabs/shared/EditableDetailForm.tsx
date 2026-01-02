import FormFieldWrapper from '../../../../../../components/common/Form/Input/FormFieldWrapper';
import type { JSX } from 'react';
import { ProfileActionButton, ProfileIconButton } from '../../../../../../components/profile/actions/ProfileActionButton';
import RequiredFieldToggle from '../../../../../../components/common/RequiredFieldToggle';

/**
 * Form field type for form schema
 */
interface FormField {
  label: string;
  name: string;
  type: string;
  required: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
}

/**
 * Form schema type
 */
interface FormSchema {
  fields?: FormField[];
}

/**
 * Reusable form component for editing detail views
 * Uses existing form infrastructure to provide consistent editing experience
 */
interface EditableDetailFormProps {
  entityType: 'generator' | 'notebook';
  getDisplayValue: (field: string) => string;
  getFormSchema?: () => FormSchema | undefined;
  updateField: (field: string, value: string) => void;
  updateFormSchema?: (schema: FormSchema) => void;
  onSave: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

const EditableDetailForm = ({ entityType,
    getDisplayValue,
    getFormSchema,
    updateField,
    updateFormSchema,
    onSave,
    onCancel,
    isLoading,
    disabled = false }: EditableDetailFormProps): JSX.Element => {
    const isGenerator = entityType === 'generator';

    const renderGeneratorFields = () => (
        <>
            <FormFieldWrapper
                label="Titel"
                htmlFor="edit-title"
                required
            >
                <input
                    id="edit-title"
                    type="text"
                    className="form-input"
                    value={getDisplayValue('title')}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="Grünerator Titel"
                    disabled={disabled}
                    required
                />
            </FormFieldWrapper>

            <FormFieldWrapper
                label="Beschreibung"
                htmlFor="edit-description"
                helpText={`${getDisplayValue('description').length}/500 Zeichen`}
            >
                <textarea
                    id="edit-description"
                    className="form-textarea"
                    value={getDisplayValue('description')}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Beschreibung des Grünerators"
                    disabled={disabled}
                    maxLength={500}
                    rows={3}
                />
            </FormFieldWrapper>

            <FormFieldWrapper
                label="Kontakt E-Mail"
                htmlFor="edit-contact"
            >
                <input
                    id="edit-contact"
                    type="email"
                    className="form-input"
                    value={getDisplayValue('contact_email')}
                    onChange={(e) => updateField('contact_email', e.target.value)}
                    placeholder="kontakt@beispiel.de"
                    disabled={disabled}
                />
            </FormFieldWrapper>

            <FormFieldWrapper
                label="Prompt-Vorlage"
                htmlFor="edit-prompt"
            >
                <textarea
                    id="edit-prompt"
                    className="form-textarea"
                    value={getDisplayValue('prompt')}
                    onChange={(e) => updateField('prompt', e.target.value)}
                    placeholder="Prompt-Vorlage für AI"
                    disabled={disabled}
                    style={{ minHeight: '200px' }}
                    rows={8}
                />
            </FormFieldWrapper>

            {/* Form fields editor */}
            <FormFieldWrapper
                label="Formularfelder"
                htmlFor="form-fields-editor"
            >
                <div id="form-fields-editor" className="form-fields-editor generator-form-fields">
                    <FormBuilderSection
                        formSchema={getFormSchema?.()}
                        updateFormSchema={updateFormSchema || (() => {})}
                        disabled={disabled}
                    />
                </div>
            </FormFieldWrapper>
        </>
    );

    const renderNotebookFields = () => (
        <>
            <FormFieldWrapper
                label="Name"
                htmlFor="edit-name"
                required
            >
                <input
                    id="edit-name"
                    type="text"
                    className="form-input"
                    value={getDisplayValue('name')}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="Notebook Name"
                    disabled={disabled}
                    required
                />
            </FormFieldWrapper>

            <FormFieldWrapper
                label="Beschreibung"
                htmlFor="edit-description"
                helpText={`${(getDisplayValue('description') || '').length}/500 Zeichen`}
            >
                <textarea
                    id="edit-description"
                    className="form-textarea"
                    value={getDisplayValue('description') || ''}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Notebook Beschreibung"
                    disabled={disabled}
                    maxLength={500}
                    rows={3}
                />
            </FormFieldWrapper>

            <FormFieldWrapper
                label="Benutzerdefinierte Anweisungen"
                htmlFor="edit-custom-prompt"
            >
                <textarea
                    id="edit-custom-prompt"
                    className="form-textarea"
                    value={getDisplayValue('custom_prompt') || ''}
                    onChange={(e) => updateField('custom_prompt', e.target.value)}
                    placeholder="Spezielle Anweisungen für dieses Notebook"
                    disabled={disabled}
                    style={{ minHeight: '150px' }}
                    rows={6}
                />
            </FormFieldWrapper>
        </>
    );

    // Get required field value for validation
    const requiredFieldValue = isGenerator
        ? getDisplayValue('title')
        : getDisplayValue('name');

    return (
        <div className="editable-detail-form">
            {isGenerator ? renderGeneratorFields() : renderNotebookFields()}

            <div className="edit-actions" style={{ marginTop: 'var(--spacing-large)' }}>
                <ProfileActionButton
                    action="edit"
                    label="Speichern"
                    variant="primary"
                    onClick={onSave}
                    disabled={isLoading || !requiredFieldValue || disabled}
                    loading={isLoading}
                />
                <ProfileActionButton
                    action="back"
                    label="Abbrechen"
                    variant="ghost"
                    onClick={onCancel}
                    disabled={isLoading}
                />
            </div>
        </div>
    );
};

/**
 * Form builder section props
 */
interface FormBuilderSectionProps {
  formSchema: FormSchema | undefined;
  updateFormSchema: (schema: FormSchema) => void;
  disabled?: boolean;
}

/**
 * Form builder section for generator form schema editing
 */
const FormBuilderSection = ({ formSchema, updateFormSchema, disabled }: FormBuilderSectionProps): JSX.Element => {
    const fields: FormField[] = formSchema?.fields || [];

    // Add form field
    const addFormField = () => {
        const newField = {
            label: '',
            name: '',
            type: 'text',
            required: false,
            placeholder: ''
        };

        updateFormSchema({
            ...formSchema,
            fields: [...fields, newField]
        });
    };

    // Remove form field
    const removeFormField = (index: number): void => {
        const updatedFields = fields.filter((_, i) => i !== index);
        updateFormSchema({
            ...formSchema,
            fields: updatedFields
        });
    };

    // Update form field
    const updateFormField = (index: number, fieldData: Partial<FormField>): void => {
        const updatedFields = fields.map((field, i) =>
            i === index ? { ...field, ...fieldData } : field
        );
        updateFormSchema({
            ...formSchema,
            fields: updatedFields
        });
    };

    // Helper functions for managing select options
    const addOption = (fieldIndex: number): void => {
        const updatedFields = [...fields];
        const field = updatedFields[fieldIndex];
        const currentOptions = field.options || [];
        updatedFields[fieldIndex] = {
            ...field,
            options: [...currentOptions, { label: '', value: '' }]
        };
        updateFormSchema({
            ...formSchema,
            fields: updatedFields
        });
    };

    const updateOption = (fieldIndex: number, optionIndex: number, optionField: string, value: string): void => {
        const updatedFields = [...fields];
        const field = updatedFields[fieldIndex];
        const currentOptions = [...(field.options || [])];
        currentOptions[optionIndex] = {
            ...currentOptions[optionIndex],
            [optionField]: value
        };
        updatedFields[fieldIndex] = {
            ...field,
            options: currentOptions
        };
        updateFormSchema({
            ...formSchema,
            fields: updatedFields
        });
    };

    const removeOption = (fieldIndex: number, optionIndex: number): void => {
        const updatedFields = [...fields];
        const field = updatedFields[fieldIndex];
        const currentOptions = field.options || [];
        updatedFields[fieldIndex] = {
            ...field,
            options: currentOptions.filter((_, i) => i !== optionIndex)
        };
        updateFormSchema({
            ...formSchema,
            fields: updatedFields
        });
    };

    return (
        <>
            {fields.map((field, index) => (
                <div key={index} className="field-editor-item field-item">
                    <div className="field-editor-row">
                        <input
                            type="text"
                            className="form-input"
                            value={field.label}
                            onChange={(e) => updateFormField(index, { label: e.target.value })}
                            placeholder="Feldbezeichnung"
                            disabled={disabled}
                        />
                        <select
                            className="form-input"
                            value={field.type}
                            onChange={(e) => updateFormField(index, { type: e.target.value })}
                            disabled={disabled}
                        >
                            <option value="text">Kurzer Text</option>
                            <option value="textarea">Langer Text</option>
                            <option value="select">Auswahlfeld</option>
                        </select>
                        <RequiredFieldToggle
                            checked={field.required}
                            onChange={(checked) => updateFormField(index, { required: checked })}
                            disabled={disabled}
                            label="Pflichtfeld"
                            showLabel={true}
                        />
                        <ProfileIconButton
                            action="delete"
                            variant="delete"
                            onClick={() => removeFormField(index)}
                            title="Feld entfernen"
                            size="small"
                            disabled={disabled}
                        />
                    </div>
                    <input
                        type="text"
                        className="form-input field-placeholder-input"
                        value={field.placeholder || ''}
                        onChange={(e) => updateFormField(index, { placeholder: e.target.value })}
                        placeholder="Platzhaltertext (optional)"
                        disabled={disabled}
                    />
                    {field.type === 'select' && (
                        <div className="select-options-container">
                            <label className="form-field-label">Auswahlmöglichkeiten</label>
                            {(field.options || []).map((option, optIndex) => (
                                <div key={optIndex} className="option-input-group">
                                    <input
                                        type="text"
                                        className="form-input option-label-input"
                                        placeholder="Anzeigetext"
                                        value={option.label || ''}
                                        onChange={(e) => {
                                            const newLabel = e.target.value;

                                            // Check if value has been manually edited
                                            const currentAutoValue = (option.label || '').toLowerCase()
                                                .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                                            const isValueAutoGenerated = option.value === currentAutoValue || !option.value;

                                            updateOption(index, optIndex, 'label', newLabel);

                                            // Only update value if it's currently auto-generated
                                            if (isValueAutoGenerated) {
                                                const newValue = newLabel.toLowerCase()
                                                    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                                                updateOption(index, optIndex, 'value', newValue);
                                            }
                                        }}
                                        disabled={disabled}
                                    />
                                    <input
                                        type="text"
                                        className="form-input option-value-input"
                                        placeholder="Technischer Wert"
                                        value={option.value || ''}
                                        onChange={(e) => updateOption(index, optIndex, 'value', e.target.value)}
                                        disabled={disabled}
                                    />
                                    <ProfileIconButton
                                        action="delete"
                                        variant="delete"
                                        onClick={() => removeOption(index, optIndex)}
                                        title="Option entfernen"
                                        size="small"
                                        disabled={disabled}
                                    />
                                </div>
                            ))}
                            <ProfileActionButton
                                action="add"
                                label="Option hinzufügen"
                                variant="secondary"
                                onClick={() => addOption(index)}
                                size="s"
                                disabled={disabled}
                            />
                        </div>
                    )}
                </div>
            ))}
            <ProfileActionButton
                action="add"
                label="Feld hinzufügen"
                variant="secondary"
                onClick={addFormField}
                size="s"
                disabled={disabled}
            />
        </>
    );
};

export default EditableDetailForm;
