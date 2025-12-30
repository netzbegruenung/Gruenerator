import React, { forwardRef, useImperativeHandle } from 'react';
import { useForm } from 'react-hook-form';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import { FormInput, FormTextarea } from '../../../components/common/Form/Input';

const UniversalForm = forwardRef(({ tabIndex = {} }, ref) => {
  const {
    control,
    getValues,
    reset
  } = useForm({
    defaultValues: {
      textForm: '',
      sprache: '',
      inhalt: '',
      usePrivacyMode: false
    }
  });

  useImperativeHandle(ref, () => ({
    getFormData: () => getValues(),
    resetForm: (data) => reset(data)
  }));

  return (
    <>
      <FormInput
        name="textForm"
        control={control}
        label="Textform"
        placeholder="z.B. Antrag, Pressemitteilung, Social Media Post, Rede..."
        rules={{ required: 'Textform ist ein Pflichtfeld' }}
        tabIndex={tabIndex.formType || 10}
      />

      <FormInput
        name="sprache"
        control={control}
        label="Sprache & Stil"
        placeholder="z.B. formal, sachlich, emotional, aktivierend..."
        rules={{ required: 'Sprache & Stil ist ein Pflichtfeld' }}
        tabIndex={tabIndex.hauptfeld || 11}
      />

      <FormTextarea
        name="inhalt"
        control={control}
        placeholder={FORM_PLACEHOLDERS.INHALT}
        rules={{ required: 'Inhalt ist ein Pflichtfeld' }}
        minRows={5}
        maxRows={15}
        className="form-textarea-large"
        tabIndex={tabIndex.hauptfeld || 12}
      />
    </>
  );
});

UniversalForm.displayName = 'UniversalForm';

export default UniversalForm; 