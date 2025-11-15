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
      thema: '',
      details: '',
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

      <FormInput
        name="thema"
        control={control}
        label={FORM_LABELS.THEME}
        placeholder={FORM_PLACEHOLDERS.THEME}
        rules={{ required: 'Thema ist ein Pflichtfeld' }}
        tabIndex={tabIndex.hauptfeld || 12}
      />

      <FormTextarea
        name="details"
        control={control}
        label={FORM_LABELS.DETAILS}
        placeholder={FORM_PLACEHOLDERS.DETAILS}
        rules={{ required: 'Details sind ein Pflichtfeld' }}
        minRows={3}
        tabIndex={tabIndex.hauptfeld || 12}
      />
    </>
  );
});

UniversalForm.displayName = 'UniversalForm';

export default UniversalForm; 