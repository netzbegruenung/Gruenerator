import React, { forwardRef, useImperativeHandle } from 'react';
import { useForm } from 'react-hook-form';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import { useFormFields } from '../../../components/common/Form/hooks';

const UniversalForm = forwardRef(({ tabIndex = {} }, ref) => {
  const { Input, Textarea } = useFormFields();
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
      <Input
        name="textForm"
        control={control}
        label="Textform"
        placeholder="z.B. Antrag, Pressemitteilung, Social Media Post, Rede..."
        rules={{ required: 'Textform ist ein Pflichtfeld' }}
        tabIndex={tabIndex.formType || 10}
      />

      <Input
        name="sprache"
        control={control}
        label="Sprache & Stil"
        placeholder="z.B. formal, sachlich, emotional, aktivierend..."
        rules={{ required: 'Sprache & Stil ist ein Pflichtfeld' }}
        tabIndex={tabIndex.hauptfeld || 11}
      />

      <Input
        name="thema"
        control={control}
        label={FORM_LABELS.THEME}
        placeholder={FORM_PLACEHOLDERS.THEME}
        rules={{ required: 'Thema ist ein Pflichtfeld' }}
        tabIndex={tabIndex.hauptfeld || 12}
      />

      <Textarea
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