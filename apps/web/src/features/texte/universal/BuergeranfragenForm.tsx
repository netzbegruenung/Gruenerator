import React, { forwardRef, useImperativeHandle } from 'react';
import { useForm, Control } from 'react-hook-form';
import { FormInput, FormTextarea } from '../../../components/common/Form/Input';

interface BuergeranfragenFormProps {
  tabIndex?: {
    formType?: number;
    hauptfeld?: number;
    [key: string]: number | undefined;
  };
}

interface BuergeranfragenFormRef {
  getFormData: () => Record<string, unknown>;
  resetForm: (data?: Record<string, unknown>) => void;
}

const BuergeranfragenForm = forwardRef<BuergeranfragenFormRef, BuergeranfragenFormProps>(({ tabIndex = {} }, ref) => {
  const {
    control,
    getValues,
    reset
  } = useForm({
    defaultValues: {
      gremium: '',
      frage: '',
      antwort: ''
    }
  });

  useImperativeHandle(ref, () => ({
    getFormData: () => getValues(),
    resetForm: (data?: Record<string, unknown>) => reset(data)
  }));

  return (
    <>
      <FormInput
        name="gremium"
        control={control as unknown as Control<Record<string, unknown>>}
        label="Gremium"
        placeholder="z.B. Stadtrat, Kreistag, Ortsvorstand..."
        rules={{ required: 'Gremium ist ein Pflichtfeld' }}
        tabIndex={tabIndex.formType || 10}
      />

      <FormTextarea
        name="frage"
        control={control as unknown as Control<Record<string, unknown>>}
        label="Frage"
        placeholder="Beschreibe die Bürger*innenanfrage..."
        rules={{ required: 'Die Frage ist ein Pflichtfeld' }}
        minRows={4}
        maxRows={12}
        className="form-textarea-large"
        tabIndex={tabIndex.hauptfeld || 11}
      />

      <FormTextarea
        name="antwort"
        control={control as unknown as Control<Record<string, unknown>>}
        label="Antwort"
        placeholder="Beschreibe, wie die Antwort ausfallen soll (z.B. Stil, Tonalität, Kontext)..."
        rules={{ required: 'Die gewünschte Antwort ist ein Pflichtfeld' }}
        minRows={3}
        maxRows={8}
        tabIndex={tabIndex.hauptfeld || 12}
      />
    </>
  );
});

BuergeranfragenForm.displayName = 'BuergeranfragenForm';

export default BuergeranfragenForm;
