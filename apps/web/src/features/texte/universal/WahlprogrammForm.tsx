import React, { forwardRef, useImperativeHandle } from 'react';
import { useForm } from 'react-hook-form';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import { FormInput, FormTextarea } from '../../../components/common/Form/Input';

interface WahlprogrammFormProps {
  tabIndex?: {
    formType?: number;
    hauptfeld?: number;
    [key: string]: number | undefined;
  };
}

interface WahlprogrammFormRef {
  getFormData: () => Record<string, unknown>;
  resetForm: (data?: Record<string, unknown>) => void;
}

const WahlprogrammForm = forwardRef<WahlprogrammFormRef, WahlprogrammFormProps>(({ tabIndex = {} }, ref) => {
  const {
    control,
    getValues,
    reset
  } = useForm({
    defaultValues: {
      inhalt: '',
      zeichenanzahl: ''
    }
  });

  useImperativeHandle(ref, () => ({
    getFormData: () => getValues(),
    resetForm: (data) => reset(data)
  }));

  return (
    <>
      <FormTextarea
        name="inhalt"
        control={control}
        placeholder={FORM_PLACEHOLDERS.INHALT}
        rules={{ required: 'Inhalt ist ein Pflichtfeld' }}
        minRows={5}
        maxRows={15}
        className="form-textarea-large"
        tabIndex={tabIndex.formType || 10}
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
