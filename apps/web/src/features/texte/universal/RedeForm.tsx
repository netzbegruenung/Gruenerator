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
      thema: '',
      zielgruppe: '',
      redezeit: ''
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

      <FormInput
        name="zielgruppe"
        control={control as unknown as Control<Record<string, unknown>>}
        label="Zielgruppe"
        placeholder="z.B. Bürger*innen von Musterdorf, Parteimitglieder..."
        rules={{ required: 'Zielgruppe ist ein Pflichtfeld' }}
        tabIndex={tabIndex.hauptfeld || 12}
      />

      <FormInput
        name="redezeit"
        control={control as unknown as Control<Record<string, unknown>>}
        type="number"
        label="Redezeit (Minuten)"
        placeholder="1-5"
        rules={{
          required: 'Redezeit ist ein Pflichtfeld',
          min: { value: 1, message: 'Die Redezeit muss mindestens 1 Minute betragen' },
          max: { value: 5, message: 'Die Redezeit darf maximal 5 Minuten betragen' }
        }}
        helpText="Maximal 5 Minuten möglich"
        tabIndex={tabIndex.hauptfeld || 13}
      />
    </>
  );
});

RedeForm.displayName = 'RedeForm';

export default RedeForm;
