import React, { forwardRef, useImperativeHandle } from 'react';
import { useForm, type Control } from 'react-hook-form';

import { FormInput, FormTextarea } from '../../../components/common/Form/Input';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';

type UniversalFormProps = Record<never, never>;

interface UniversalFormRef {
  getFormData: () => Record<string, unknown>;
  resetForm: (data?: Record<string, unknown>) => void;
}

const UniversalForm = forwardRef<UniversalFormRef, UniversalFormProps>((_props, ref) => {
  const { control, getValues, reset } = useForm({
    defaultValues: {
      textForm: '',
      inhalt: '',
      usePrivacyMode: false,
    },
  });

  useImperativeHandle(ref, () => ({
    getFormData: () => getValues(),
    resetForm: (data) => reset(data),
  }));

  return (
    <>
      <FormInput
        name="textForm"
        control={control as unknown as Control<Record<string, unknown>>}
        label="Textform"
        placeholder="z.B. Antrag, Pressemitteilung, Social Media Post, Rede..."
        rules={{ required: 'Textform ist ein Pflichtfeld' }}
      />

      <FormTextarea
        name="inhalt"
        control={control as unknown as Control<Record<string, unknown>>}
        label="Inhalt"
        placeholder={FORM_PLACEHOLDERS.INHALT}
        rules={{ required: 'Inhalt ist ein Pflichtfeld' }}
        minRows={5}
        maxRows={15}
        className="form-textarea-large"
      />
    </>
  );
});

UniversalForm.displayName = 'UniversalForm';

export default UniversalForm;
