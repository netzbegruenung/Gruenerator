import React, { forwardRef, useImperativeHandle } from 'react';
import { useForm } from 'react-hook-form';
import { useFormFields } from '../../../../components/common/Form/hooks';

const LeichteSpracheForm = forwardRef(({ tabIndex = {}, onUrlsDetected }, ref) => {
  const { Textarea } = useFormFields();

  const {
    control,
    getValues,
    formState: { errors }
  } = useForm({
    defaultValues: {
      originalText: '',
      targetLanguage: 'Deutsch'
    }
  });

  // Expose form data to parent component
  useImperativeHandle(ref, () => ({
    getFormData: () => {
      const formData = getValues();
      return {
        ...formData
      };
    },
    isValid: () => {
      const formData = getValues();
      return formData.originalText && formData.originalText.trim().length > 0;
    }
  }), [getValues]);

  return (
    <>
      <Textarea
        name="originalText"
        control={control}
        placeholder="Gib hier den Text ein, der in Leichte Sprache übersetzt werden soll..."
        rules={{ required: 'Text ist ein Pflichtfeld' }}
        minRows={5}
        maxRows={15}
        className="form-textarea-large"
        tabIndex={tabIndex.originalText}
        enableUrlDetection={true}
        onUrlsDetected={onUrlsDetected}
      />
    </>
  );
});

LeichteSpracheForm.displayName = 'LeichteSpracheForm';

export default LeichteSpracheForm;
