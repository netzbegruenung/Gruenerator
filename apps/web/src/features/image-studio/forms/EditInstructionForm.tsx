import React from 'react';
import TextAreaInput from '../../../components/common/Form/Input/TextAreaInput';
import FormFieldWrapper from '../../../components/common/Form/Input/FormFieldWrapper';
import useImageStudioStore from '../../../stores/imageStudioStore';

/**
 * Unified Edit Instruction Form
 * Config-driven form for KI edit types (GREEN_EDIT, UNIVERSAL_EDIT)
 * Props come from TYPE_CONFIG.formProps
 */
const EditInstructionForm = ({
  label = 'Anweisungen',
  placeholder = 'Beschreibe, was geändert werden soll...',
  helpText = '',
  rows = 5,
  maxLength = 500,
  loading = false,
  formErrors = {}
}) => {
  const {
    precisionInstruction,
    setPrecisionInstruction
  } = useImageStudioStore();

  const hasError = formErrors.precisionInstruction;
  const charCount = precisionInstruction?.length || 0;
  const showCharCount = charCount >= maxLength - 50;

  return (
    <div>
      <FormFieldWrapper
        label={label}
        helpText={helpText}
        htmlFor="edit-instruction"
        error={hasError}
      >
        <TextAreaInput
          id="edit-instruction"
          value={precisionInstruction}
          onChange={(e) => setPrecisionInstruction(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          disabled={loading}
          className={hasError ? 'error-input' : ''}
        />
      </FormFieldWrapper>
      {hasError && (
        <span className="error-message">{formErrors.precisionInstruction}</span>
      )}
      {!hasError && showCharCount && (
        <div style={{
          fontSize: 'var(--font-size-small)',
          color: 'var(--font-color)',
          opacity: 0.6,
          textAlign: 'right',
          marginTop: 'var(--spacing-xsmall)'
        }}>
          {charCount}/{maxLength} Zeichen
        </div>
      )}
    </div>
  );
};

export default EditInstructionForm;
