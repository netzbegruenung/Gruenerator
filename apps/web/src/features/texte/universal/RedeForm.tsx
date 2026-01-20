import React, { forwardRef, useImperativeHandle } from 'react';
import { Control, useForm } from 'react-hook-form';
import { FormInput, FormTextarea } from '../../../components/common/Form/Input';

interface RedeFormProps {
  tabIndex?: {
    formType?: number;
    hauptfeld?: number;
    [key: string]: number | undefined;
  };
}

interface RedeFormRef {
  getFormData: () => Record<string, unknown>;
  resetForm: (data?: Record<string, unknown>) => void;
}

const RedeForm = forwardRef<RedeFormRef, RedeFormProps>(({ tabIndex = {} }, ref) => {
  const {
    control,
    getValues,
    reset
  } = useForm({
    defaultValues: {
      rolle: '',
      thema: ''
    }
  });

  useImperativeHandle(ref, () => ({
    getFormData: () => getValues(),
    resetForm: (data) => reset(data)
  }));

  return (
    <>
      <FormInput
        name="rolle"
        control={control as unknown as Control<Record<string, unknown>>}
        label="Rolle"
        placeholder="z.B. Sprecher*in der Grünen OV Musterdorf, Antragssteller*in..."
        rules={{ required: 'Rolle ist ein Pflichtfeld' }}
        tabIndex={tabIndex.formType || 10}
      />

      <FormTextarea
        name="thema"
        control={control as unknown as Control<Record<string, unknown>>}
        label="Thema"
        placeholder="Beschreibe das Thema, den Anlass und besondere Schwerpunkte der Rede..."
        rules={{ required: 'Thema ist ein Pflichtfeld' }}
        minRows={4}
        maxRows={10}
        className="form-textarea-large"
        tabIndex={tabIndex.hauptfeld || 11}
      />
    </>
  );
});

RedeForm.displayName = 'RedeForm';

export default RedeForm;
