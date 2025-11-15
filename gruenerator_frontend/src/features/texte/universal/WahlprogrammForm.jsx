import React, { forwardRef, useImperativeHandle } from 'react';
import { useForm } from 'react-hook-form';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import { FormInput, FormTextarea } from '../../../components/common/Form/Input';

const WahlprogrammForm = forwardRef(({ tabIndex = {} }, ref) => {
  const {
    control,
    getValues,
    reset
  } = useForm({
    defaultValues: {
      thema: '',
      details: '',
      zeichenanzahl: ''
    }
  });

  useImperativeHandle(ref, () => ({
    getFormData: () => getValues(),
    resetForm: (data) => reset(data)
  }));

  return (
    <>
      <FormInput
        name="thema"
        control={control}
        label={FORM_LABELS.THEME}
        placeholder={FORM_PLACEHOLDERS.THEME}
        rules={{ required: 'Thema ist ein Pflichtfeld' }}
        tabIndex={tabIndex.formType || 10}
      />

      <FormTextarea
        name="details"
        control={control}
        label={FORM_LABELS.DETAILS}
        placeholder={FORM_PLACEHOLDERS.DETAILS}
        rules={{ required: 'Details sind ein Pflichtfeld' }}
        minRows={3}
        tabIndex={tabIndex.hauptfeld || 11}
      />

      <FormInput
        name="zeichenanzahl"
        control={control}
        type="number"
        label={FORM_LABELS.CHARACTER_COUNT}
        placeholder="1000-3500"
        rules={{ 
          required: 'Zeichenanzahl ist ein Pflichtfeld',
          min: { value: 1000, message: 'Die Zeichenanzahl muss mindestens 1.000 betragen' },
          max: { value: 3500, message: 'Die Zeichenanzahl darf maximal 3.500 betragen' }
        }}
        helpText="Zwischen 1.000 und 3.500 Zeichen möglich"
        tabIndex={tabIndex.hauptfeld || 12}
      />
    </>
  );
});

WahlprogrammForm.displayName = 'WahlprogrammForm';

export default WahlprogrammForm; 