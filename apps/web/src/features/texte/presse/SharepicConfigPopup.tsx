import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Controller } from 'react-hook-form';
import { HiX } from 'react-icons/hi';
import ReactSelect from 'react-select';

import FileUpload from '../../../components/common/FileUpload';
import FormFieldWrapper from '../../../components/common/Form/Input/FormFieldWrapper';
import SmartInput from '../../../components/common/Form/SmartInput';

import type { Control, UseFormSetValue, UseFormGetValues } from 'react-hook-form';

interface SharepicTypeOption {
  value: string;
  label: string;
}

interface SharepicFormValues {
  sharepicType?: string;
  zitatAuthor?: string;
  uploadedImage?: string | null;
  [key: string]: unknown;
}

interface SharepicConfigPopupProps {
  isOpen: boolean;
  onClose: () => void;
  control: Control<SharepicFormValues>;
  setValue: UseFormSetValue<SharepicFormValues>;
  getValues: UseFormGetValues<SharepicFormValues>;
  sharepicTypeOptions: SharepicTypeOption[];
  watchSharepicType?: string;
  uploadedImage?: string | null;
  handleImageChange: (image: string | null) => void;
  loading?: boolean;
  success?: boolean;
}

const SharepicConfigPopup = ({
  isOpen,
  onClose,
  control,
  setValue,
  getValues,
  sharepicTypeOptions,
  watchSharepicType,
  uploadedImage,
  handleImageChange,
  loading,
  success,
}: SharepicConfigPopupProps) => {
  const [fileObject, setFileObject] = useState<File | null>(null);

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
          handleImageChange(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        handleImageChange(null);
      }
    },
    [handleImageChange]
  );

  if (!isOpen) return null;

  const showAuthorField = watchSharepicType === 'quote' || watchSharepicType === 'quote_pure';
  const showImageUpload = watchSharepicType === 'dreizeilen' || watchSharepicType === 'quote';

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-md max-[480px]:items-end max-[480px]:p-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex w-full max-w-[420px] flex-col overflow-hidden rounded-lg border border-grey-200 bg-background-pure shadow-lg dark:border-grey-700 max-[480px]:max-h-[80vh] max-[480px]:max-w-full max-[480px]:rounded-b-none"
            style={{ maxHeight: '90vh' }}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-grey-200 p-md dark:border-grey-700">
              <h3 className="m-0 text-[1.1rem] font-semibold text-foreground">Sharepic konfigurieren</h3>
              <button
                type="button"
                className="flex size-8 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent text-grey-400 transition-colors hover:bg-background-alt hover:text-foreground"
                onClick={onClose}
                aria-label="Schließen"
              >
                <HiX size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-sm overflow-y-auto p-md">
              <Controller
                name="sharepicType"
                control={control}
                rules={{}}
                defaultValue="default"
                render={({ field, fieldState: { error } }) => (
                  <FormFieldWrapper
                    label="Sharepic Art"
                    required={false}
                    error={error?.message}
                    htmlFor="sharepicType-select-popup"
                  >
                    <ReactSelect
                      {...field}
                      inputId="sharepicType-select-popup"
                      className={`react-select ${error ? 'error' : ''}`.trim()}
                      classNamePrefix="react-select"
                      options={sharepicTypeOptions}
                      value={sharepicTypeOptions.find((option) => option.value === field.value)}
                      onChange={(selectedOption) => {
                        field.onChange(selectedOption ? selectedOption.value : '');
                      }}
                      onBlur={field.onBlur}
                      placeholder="Sharepic Art auswählen..."
                      isClearable={false}
                      isSearchable={false}
                      noOptionsMessage={() => 'Keine Optionen verfügbar'}
                      menuPortalTarget={document.body}
                      menuPosition="fixed"
                      styles={{
                        menuPortal: (base) => ({ ...base, zIndex: 10001 }),
                      }}
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
                      control={control}
                      setValue={setValue}
                      getValues={getValues}
                      label="Autor/Urheber des Zitats"
                      placeholder="z.B. Anton Hofreiter"
                      rules={{ required: 'Autor ist für Zitat-Sharepics erforderlich' }}
                      onSubmitSuccess={success ? getValues('zitatAuthor') : null}
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
            </div>

            <div className="flex justify-end border-t border-grey-200 p-md dark:border-grey-700">
              <button
                type="button"
                className="cursor-pointer rounded-sm border-none bg-secondary-600 px-md py-xs font-medium text-white transition-colors hover:bg-primary-700"
                onClick={onClose}
              >
                Fertig
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
};

export default SharepicConfigPopup;
