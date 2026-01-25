import { motion, AnimatePresence } from 'motion/react';
import React, { forwardRef, useImperativeHandle, useState, useCallback, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import ReactSelect from 'react-select';

import FileUpload from '../../../../components/common/FileUpload';
import FormFieldWrapper from '../../../../components/common/Form/Input/FormFieldWrapper';
import SmartInput from '../../../../components/common/Form/SmartInput';

export interface SharepicFormData {
  sharepicType: string;
  zitatAuthor: string;
  uploadedImage: string | null;
}

interface SharepicFormProps {
  isVisible: boolean;
  sharepicTypeOptions: Array<{
    value: string;
    label: string;
  }>;
  loading?: boolean;
  success?: boolean;
  control?: unknown;
  setValue?: unknown;
  getValues?: unknown;
}

export interface SharepicFormRef {
  getFormData: () => SharepicFormData;
  resetForm: (data?: Partial<SharepicFormData>) => void;
}

const SharepicForm = forwardRef<SharepicFormRef, SharepicFormProps>(
  ({ isVisible, sharepicTypeOptions, loading, success }, ref) => {
    const { control, getValues, setValue, reset, watch } = useForm<SharepicFormData>({
      defaultValues: {
        sharepicType: 'default',
        zitatAuthor: '',
        uploadedImage: null,
      },
      shouldUnregister: false,
    });

    const watchSharepicType = watch('sharepicType');
    const [fileObject, setFileObject] = useState<File | null>(null);
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);

    useEffect(() => {
      if (!uploadedImage) {
        setFileObject(null);
      }
    }, [uploadedImage]);

    const handleFileChange = useCallback(
      (file: File | null) => {
        setFileObject(file);
        if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            setUploadedImage(result);
            setValue('uploadedImage', result);
          };
          reader.readAsDataURL(file);
        } else {
          setUploadedImage(null);
          setValue('uploadedImage', null);
        }
      },
      [setValue]
    );

    useImperativeHandle(
      ref,
      () => ({
        getFormData: () => {
          const formData = getValues();
          return {
            sharepicType: formData.sharepicType || 'default',
            zitatAuthor: formData.zitatAuthor || '',
            uploadedImage: formData.uploadedImage || null,
          };
        },
        resetForm: (data?: Partial<SharepicFormData>) => {
          if (data) {
            reset(data as SharepicFormData);
          } else {
            reset();
          }
          setUploadedImage(null);
          setFileObject(null);
        },
      }),
      [getValues, reset]
    );

    if (!isVisible) {
      return null;
    }

    const showAuthorField = watchSharepicType === 'quote' || watchSharepicType === 'quote_pure';
    const showImageUpload = watchSharepicType === 'dreizeilen' || watchSharepicType === 'quote';

    return (
      <motion.div
        className="sharepic-fields"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 25,
          duration: 0.25,
        }}
      >
        <h4>Sharepic:</h4>

        <Controller
          name="sharepicType"
          control={control}
          defaultValue="default"
          render={({ field, fieldState: { error } }) => (
            <FormFieldWrapper
              label="Sharepic Art"
              required={false}
              error={error?.message}
              htmlFor="sharepicType-select"
            >
              <ReactSelect
                {...field}
                inputId="sharepicType-select"
                className={`react-select ${error ? 'error' : ''}`.trim()}
                classNamePrefix="react-select"
                options={sharepicTypeOptions}
                value={sharepicTypeOptions.find((option) => option.value === field.value)}
                onChange={(selectedOption) => {
                  field.onChange(selectedOption ? selectedOption.value : 'default');
                }}
                onBlur={field.onBlur}
                placeholder="Sharepic Art auswählen..."
                isClearable={false}
                isSearchable={false}
                noOptionsMessage={() => 'Keine Optionen verfügbar'}
              />
            </FormFieldWrapper>
          )}
        />

        <AnimatePresence>
          {showAuthorField && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <SmartInput
                fieldType="zitatAuthor"
                formName="presseSocial"
                name="zitatAuthor"
                control={control as never}
                setValue={setValue as never}
                getValues={getValues as never}
                label="Autor/Urheber des Zitats"
                placeholder="z.B. Anton Hofreiter"
                rules={{ required: 'Autor ist für Zitat-Sharepics erforderlich' }}
                onSubmitSuccess={success ? String(getValues('zitatAuthor') || '') : null}
                shouldSave={success}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showImageUpload && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <FileUpload
                handleChange={handleFileChange}
                allowedTypes={['.jpg', '.jpeg', '.png', '.webp']}
                file={fileObject}
                loading={loading}
                label="Bild für Sharepic (optional)"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }
);

SharepicForm.displayName = 'SharepicForm';

export default SharepicForm;
