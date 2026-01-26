import React, { forwardRef, useImperativeHandle } from 'react';
import { useForm, type Control } from 'react-hook-form';

import { FormTextarea } from '../../components/common/Form/Input';

interface PromptInputFormProps {
  tabIndex?: {
    hauptfeld?: number;
    [key: string]: number | undefined;
  };
}

interface PromptInputFormRef {
  getFormData: () => Record<string, unknown>;
  resetForm: (data?: Record<string, unknown>) => void;
}

const PromptInputForm = forwardRef<PromptInputFormRef, PromptInputFormProps>(
  ({ tabIndex = {} }, ref) => {
    const { control, getValues, reset } = useForm({
      defaultValues: {
        userInput: '',
      },
    });

    useImperativeHandle(ref, () => ({
      getFormData: () => getValues(),
      resetForm: (data) => reset(data),
    }));

    return (
      <FormTextarea
        name="userInput"
        control={control as unknown as Control<Record<string, unknown>>}
        placeholder="Gib hier deinen Text oder Kontext ein..."
        rules={{ required: 'Bitte gib einen Text ein' }}
        minRows={6}
        maxRows={16}
        className="form-textarea-large"
        tabIndex={tabIndex.hauptfeld || 10}
      />
    );
  }
);

PromptInputForm.displayName = 'PromptInputForm';

export default PromptInputForm;
