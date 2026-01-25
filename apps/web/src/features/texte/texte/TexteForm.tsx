import React, { forwardRef, useImperativeHandle } from 'react';
import { useForm, type Control } from 'react-hook-form';

import { FormTextarea } from '../../../components/common/Form/Input';

interface TexteFormProps {
  tabIndex?: {
    formType?: number;
    hauptfeld?: number;
    [key: string]: number | undefined;
  };
}

interface TexteFormRef {
  getFormData: () => Record<string, unknown>;
  resetForm: (data?: Record<string, unknown>) => void;
}

const TexteForm = forwardRef<TexteFormRef, TexteFormProps>(({ tabIndex = {} }, ref) => {
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
      placeholder="Beschreibe deinen Text... z.B. 'Schreibe einen Social Media Post über Klimaschutz' oder 'Formuliere eine E-Mail-Antwort auf eine Bürgeranfrage'"
      rules={{ required: 'Bitte beschreibe, welchen Text du erstellen möchtest' }}
      minRows={6}
      maxRows={16}
      className="form-textarea-large"
      tabIndex={tabIndex.hauptfeld || 10}
    />
  );
});

TexteForm.displayName = 'TexteForm';

export default TexteForm;
