import React, { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useForm } from 'react-hook-form';

import FileUpload from '../../../../components/common/FileUpload';
import { useFormFields } from '../../../../components/common/Form/hooks';

interface AltTextFormProps {
  tabIndex?: {
    fileUpload?: number;
    imageDescription?: number;
    [key: string]: number | undefined;
  };
}

interface AltTextFormRef {
  getFormData: () => Record<string, unknown>;
  isValid: () => boolean;
}

const AltTextForm = forwardRef<AltTextFormRef, AltTextFormProps>(({ tabIndex = {} }, ref) => {
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
        tabIndex={tabIndex.fileUpload}
      />

      <Input
        name="imageDescription"
        control={control}
        label="Zusätzliche Bildbeschreibung (optional)"
        placeholder="z.B. Kontext, Zweck oder besondere Details des Bildes..."
        maxRows={3}
        tabIndex={tabIndex.imageDescription}
      />
    </>
  );
});

AltTextForm.displayName = 'AltTextForm';

export default AltTextForm;
