import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import FormInput from '../../../components/common/Form/Input/FormInput';
import FormCheckbox from '../../../components/common/Form/Input/FormCheckbox';

interface SelectOption {
  label: string;
  value: string;
}

interface FieldData {
  label: string;
  name: string;
  type: string;
  placeholder?: string;
  required?: boolean;
  options?: SelectOption[];
}

interface FieldEditorAssistantProps {
  initialFieldData?: FieldData | null;
  onSave: (fieldData: FieldData) => void;
  onCancel: () => void;
  existingFieldNames?: string[];
}

// Helper function to generate the sanitized name
const generateSanitizedName = (label: string): string => {
  return label
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
};

const FieldEditorAssistant: React.FC<FieldEditorAssistantProps> = ({ initialFieldData, onSave, onCancel, existingFieldNames = [] }) => {
  // Initialize React Hook Form
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
    trigger
  } = useForm({
    defaultValues: {
      label: '',
      name: '',
      type: 'text',
      placeholder: '',
      required: false,
      options: [],
    },
    mode: 'onChange'
  });

  const [error, setError] = useState(null);
  
  // Helper functions for managing select options
  const addOption = () => {
    const currentOptions = watchedOptions || [];
    setValue('options', [...currentOptions, { label: '', value: '' }], { shouldValidate: false });
  };

  const updateOption = (index, field, value) => {
    const currentOptions = watchedOptions || [];
    const newOptions = [...currentOptions];
    newOptions[index] = { ...newOptions[index], [field]: value };
    setValue('options', newOptions, { shouldValidate: false });
  };

  const removeOption = (index) => {
    const currentOptions = watchedOptions || [];
    setValue('options', currentOptions.filter((_, i) => i !== index), { shouldValidate: false });
  };

  // Watch label for auto-generation
  const watchedLabel = watch('label');
  const watchedType = watch('type');
  const watchedOptions = watch('options');

  useEffect(() => {
    // Initialize with existing data if provided (for editing)
    if (initialFieldData) {
      reset({
        ...initialFieldData,
        // Ensure name is also initialized if passed
        name: initialFieldData.name || generateSanitizedName(initialFieldData.label || '')
      });
    } else {
      // Reset for adding a new field
      reset({
        label: '',
        name: '',
        type: 'text',
        placeholder: '',
        required: false,
        options: [],
      });
    }
    setError(null); // Clear errors when component initializes or data changes
  }, [initialFieldData, reset]); // Re-run when initial data changes

  // Auto-generation effect for label changes
  useEffect(() => {
    if (watchedLabel) {
      const sanitizedName = generateSanitizedName(watchedLabel);
      setValue('name', sanitizedName, { shouldValidate: false });

      // Auto-suggest field type
      if (watchedLabel.toLowerCase().includes('beschreibung') || 
          watchedLabel.toLowerCase().includes('text') || 
          watchedLabel.toLowerCase().includes('inhalt') || 
          watchedLabel.toLowerCase().includes('prompt') || 
          watchedLabel.toLowerCase().includes('abschnitt')) {
        setValue('type', 'textarea', { shouldValidate: false });
      }

      // Auto-suggest required status
      if (watchedLabel.toLowerCase().includes('email') || 
          watchedLabel.toLowerCase().includes('name') || 
          watchedLabel.toLowerCase().includes('titel')) {
        setValue('required', true, { shouldValidate: false });
      }

      // Clear any errors when label changes
      setError(null);
    }
  }, [watchedLabel, setValue]);

  // Effect to handle type changes and options initialization
  useEffect(() => {
    const currentOptions = watchedOptions || [];
    
    if (watchedType === 'select' && currentOptions.length === 0) {
      // When switching to select type, ensure at least one option exists
      setValue('options', [{ label: '', value: '' }], { shouldValidate: false });
    } else if (watchedType !== 'select' && currentOptions.length > 0) {
      // When switching away from select type, clear options
      setValue('options', [], { shouldValidate: false });
    }
  }, [watchedType, watchedOptions, setValue]);


  // Define validation rules
  const validationRules = {
    label: {
      required: 'Das Label darf nicht leer sein.',
      minLength: { value: 1, message: 'Label muss mindestens 1 Zeichen lang sein.' }
    },
    name: {
      required: 'Technischer Name konnte nicht generiert werden.',
      validate: (value) => {
        const otherNames = initialFieldData 
          ? existingFieldNames.filter(n => n !== initialFieldData.name)
          : existingFieldNames;
        return !otherNames.includes(value) || 
          `Der technische Name '${value}' wird bereits von einem anderen Feld verwendet.`;
      }
    }
  };

  // Form submission handler
  const onSubmit = (data) => {
    setError(null);
    onSave(data);
  };

  const handleSaveClick = handleSubmit(onSubmit);

  return (
    <div className="field-editor-assistant p-3 mb-3 border rounded"> 
      <h5>Feld bearbeiten/hinzufügen</h5>
      {error && <div className="alert alert-danger">{error}</div>}
      {(errors.label || errors.name) && (
        <div className="alert alert-danger">
          {errors.label?.message || errors.name?.message}
        </div>
      )}
      
      {/* Label Input */}
      <FormInput
        name="label"
        label="Was soll im Formular stehen?"
        placeholder="z.B. Thema des Artikels"
        required={true}
        control={control}
        rules={validationRules.label}
      />

      {/* Type Selection - Custom Controller for Toggle Buttons */}
      <div className="form-group">
        <label className="form-field-label">Feld-Typ</label>
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <div className="type-selector-container" role="radiogroup" aria-labelledby="type-label">
              <button 
                type="button"
                className={`btn type-selector-button ${field.value === 'text' ? 'active' : ''}`}
                onClick={() => {
                  field.onChange('text');
                  setError(null);
                }}
                aria-pressed={field.value === 'text'}
              >
                Kurzer Text
              </button>
              <button 
                type="button"
                className={`btn type-selector-button ${field.value === 'textarea' ? 'active' : ''}`}
                onClick={() => {
                  field.onChange('textarea');
                  setError(null);
                }}
                aria-pressed={field.value === 'textarea'}
              >
                Langer Text
              </button>
              <button 
                type="button"
                className={`btn type-selector-button ${field.value === 'select' ? 'active' : ''}`}
                onClick={() => {
                  field.onChange('select');
                  setError(null);
                }}
                aria-pressed={field.value === 'select'}
              >
                Auswahlfeld
              </button>
            </div>
          )}
        />
      </div>

      {/* Placeholder Input */}
      <FormInput
        name="placeholder"
        label={watchedType === 'select' ? "Standardtext (optional)" : "Hilfetext im Feld (optional)"}
        placeholder={watchedType === 'select' ? "z.B. Bitte wählen..." : "z.B. Gib hier das Hauptthema an"}
        required={false}
        control={control}
      />

      {/* Options Management - Only shown for select type */}
      {watchedType === 'select' && (
        <div className="form-group">
          <label className="form-field-label">Auswahlmöglichkeiten</label>
          <div className="select-options-container">
            {(watchedOptions || []).map((option, index) => (
              <div key={index} className="option-input-group">
                <input
                  type="text"
                  placeholder="Anzeigetext"
                  value={option.label || ''}
                  onChange={(e) => {
                    const newLabel = e.target.value;
                    const newValue = newLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                    updateOption(index, 'label', newLabel);
                    updateOption(index, 'value', newValue);
                  }}
                  className="form-control option-label-input"
                />
                <input
                  type="text"
                  placeholder="Technischer Wert"
                  value={option.value || ''}
                  onChange={(e) => updateOption(index, 'value', e.target.value)}
                  className="form-control option-value-input"
                />
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  className="btn btn-sm btn-danger option-remove-btn"
                  aria-label="Option entfernen"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addOption}
              className="btn btn-sm btn-tanne-bordered add-option-btn"
            >
              + Option hinzufügen
            </button>
          </div>
        </div>
      )}

      {/* Required Toggle Switch - Custom Controller */}
      <div className="form-group toggle-switch-group">
        <label className="form-check-label" htmlFor="assistant-required-toggle">
          Muss dieses Feld ausgefüllt werden? (Pflichtfeld)
        </label>
        <Controller
          name="required"
          control={control}
          render={({ field }) => (
            <button 
              type="button" 
              role="switch"
              aria-checked={field.value}
              id="assistant-required-toggle"
              className={`toggle-switch ${field.value ? 'checked' : ''}`}
              onClick={() => {
                field.onChange(!field.value);
                setError(null);
              }}
            >
              <span className="toggle-switch-thumb"></span>
            </button>
          )}
        />
      </div>

        {/* Action Buttons */}
        <div className="action-button-container">
          <button type="button" onClick={onCancel} className="btn btn-tanne-bordered">
            Abbrechen
          </button>
          <button 
            type="button"
            onClick={handleSaveClick}
            className="btn btn-primary"
          >
            Feld speichern
          </button>
        </div>
    </div>
  );
};

export default FieldEditorAssistant; 