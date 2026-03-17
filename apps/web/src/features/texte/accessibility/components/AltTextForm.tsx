import React, { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useForm } from 'react-hook-form';

import FileUpload from '../../../../components/common/FileUpload';
import { useFormFields } from '../../../../components/common/Form/hooks';

type AltTextFormProps = Record<never, never>;

interface AltTextFormRef {
  getFormData: () => Record<string, unknown>;
  isValid: () => boolean;
}

const AltTextForm = forwardRef<AltTextFormRef, AltTextFormProps>((_props, ref) => {
  const { Input } = useFormFields() as unknown as { Input: React.ComponentType<any> };

  const [uploadedImage, setUploadedImage] = useState<File | null>(null);

  const {
    control,
    getValues,
    formState: { errors },
  } = useForm({
    defaultValues: {
      imageDescription: '',
    },
  });

  const handleImageChange = useCallback((file: File | null) => {
    setUploadedImage(file);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getFormData: () => {
        const formData = getValues();
        return {
          ...formData,
          uploadedImage,
          imageSource: 'upload',
          hasUploadedImage: uploadedImage !== null,
        };
      },
      isValid: () => {
        return uploadedImage !== null;
      },
    }),
    [getValues, uploadedImage]
  );

  return (
    <>
      <FileUpload
        handleChange={handleImageChange}
        allowedTypes={['.jpg', '.jpeg', '.png', '.webp']}
        file={uploadedImage}
        label="Bild für Alt-Text (erforderlich)"
      />

      <Input
        name="imageDescription"
        control={control}
        label="Zusätzliche Bildbeschreibung (optional)"
        placeholder="z.B. Kontext, Zweck oder besondere Details des Bildes..."
        maxRows={3}
      />
    </>
  );
});

AltTextForm.displayName = 'AltTextForm';

export default AltTextForm;
