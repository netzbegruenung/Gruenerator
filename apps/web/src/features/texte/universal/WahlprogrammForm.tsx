import React, { forwardRef, useImperativeHandle } from 'react';
import { type Control, useForm } from 'react-hook-form';

import { FormTextarea } from '../../../components/common/Form/Input';
import { FORM_PLACEHOLDERS } from '../../../components/utils/constants';

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

const WahlprogrammForm = forwardRef<WahlprogrammFormRef, WahlprogrammFormProps>(
  ({ tabIndex = {} }, ref) => {
    const { control, getValues, reset } = useForm({
      defaultValues: {
        inhalt: '',
      },
    });

    useImperativeHandle(ref, () => ({
      getFormData: () => getValues(),
      resetForm: (data) => reset(data),
    }));

    return (
      <FormTextarea
        name="inhalt"
        control={control as unknown as Control<Record<string, unknown>>}
        label="Inhalt"
        placeholder={FORM_PLACEHOLDERS.INHALT}
        rules={{ required: 'Inhalt ist ein Pflichtfeld' }}
        minRows={5}
        maxRows={15}
        className="form-textarea-large"
        tabIndex={tabIndex.formType || 10}
      />
    );
  }
);

WahlprogrammForm.displayName = 'WahlprogrammForm';

export default WahlprogrammForm;
