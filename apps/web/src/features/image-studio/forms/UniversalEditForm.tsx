import React from 'react';
import TextAreaInput from '../../../components/common/Form/Input/TextAreaInput';
import FormFieldWrapper from '../../../components/common/Form/Input/FormFieldWrapper';
import useImageStudioStore from '../../../stores/imageStudioStore';

interface UniversalEditFormProps {
  loading?: boolean;
  formErrors?: Record<string, string>;
}

const UniversalEditForm = ({ loading = false, formErrors = {} }: UniversalEditFormProps) => {
  const {
    precisionInstruction,
    setPrecisionInstruction
  } = useImageStudioStore();

  const hasError = formErrors.precisionInstruction;

  return (
    <div>
      <FormFieldWrapper
        label="Bearbeitungsanweisungen"
        helpText="Beschreibe detailliert, was im Bild verändert werden soll"
        htmlFor="universal-instruction"
        error={hasError}
      >
        <TextAreaInput
          id="universal-instruction"
          value={precisionInstruction}
          onChange={(e) => setPrecisionInstruction(e.target.value)}
          placeholder="z.B.: 'Ersetze den Himmel durch einen Sonnenuntergang, füge Wolken hinzu, mache das Gras grüner...'"
          rows={6}
          maxLength={500}
          disabled={loading}
          className={hasError ? 'error-input' : ''}
        />
      </FormFieldWrapper>
      {hasError && (
        <span className="error-message">{formErrors.precisionInstruction}</span>
      )}
      {!hasError && precisionInstruction.length >= 450 && (
        <div style={{
          fontSize: 'var(--font-size-small)',
          color: 'var(--font-color)',
          opacity: 0.6,
          textAlign: 'right',
          marginTop: 'var(--spacing-xsmall)'
        }}>
          {precisionInstruction.length}/500 Zeichen
        </div>
      )}
    </div>
  );
};

export default UniversalEditForm;
