import React from 'react';
import TextAreaInput from '../../../components/common/Form/Input/TextAreaInput';
import FormFieldWrapper from '../../../components/common/Form/Input/FormFieldWrapper';
import useImageStudioStore from '../../../stores/imageStudioStore';

interface GreenEditFormProps {
  loading?: boolean;
  formErrors?: Record<string, string>;
}

const GreenEditForm = ({ loading = false, formErrors = {} }: GreenEditFormProps) => {
  const {
    precisionInstruction,
    setPrecisionInstruction
  } = useImageStudioStore();

  const hasError = formErrors.precisionInstruction;

  return (
    <div>
      <FormFieldWrapper
        label="Was soll grüner werden?"
        htmlFor="precision-instruction"
        error={hasError}
      >
        <TextAreaInput
          id="precision-instruction"
          value={precisionInstruction}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrecisionInstruction(e.target.value)}
          placeholder="z.B.: 'Füge große Linden auf beiden Straßenseiten hinzu, ersetze die Parkplätze durch einen Fahrradweg mit grünem Belag, platziere Bänke unter den Bäumen...'"
          rows={4}
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

export default GreenEditForm;
