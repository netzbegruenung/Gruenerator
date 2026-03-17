import React, { forwardRef, useImperativeHandle } from 'react';
import { type Control, useForm } from 'react-hook-form';

import { FormInput, FormTextarea } from '../../../components/common/Form/Input';

type RedeFormProps = Record<never, never>;

interface RedeFormRef {
  getFormData: () => Record<string, unknown>;
  resetForm: (data?: Record<string, unknown>) => void;
}

const RedeForm = forwardRef<RedeFormRef, RedeFormProps>((_props, ref) => {
  const { control, getValues, reset } = useForm({
    defaultValues: {
      rolle: '',
      thema: '',
    },
  });

  useImperativeHandle(ref, () => ({
    getFormData: () => getValues(),
    resetForm: (data) => reset(data),
  }));

  return (
    <>
      <FormInput
        name="rolle"
        control={control as unknown as Control<Record<string, unknown>>}
        label="Rolle"
        placeholder="z.B. Sprecher*in der Grünen OV Musterdorf, Antragssteller*in..."
        rules={{ required: 'Rolle ist ein Pflichtfeld' }}
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
      />
    </>
  );
});

RedeForm.displayName = 'RedeForm';

export default RedeForm;
