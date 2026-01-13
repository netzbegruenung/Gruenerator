import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Controller } from 'react-hook-form';
import ReactSelect from 'react-select';
import { HiX } from 'react-icons/hi';
import FormFieldWrapper from '../../../components/common/Form/Input/FormFieldWrapper';
import SmartInput from '../../../components/common/Form/SmartInput';
import FileUpload from '../../../components/common/FileUpload';
import type { Control, UseFormSetValue, UseFormGetValues } from 'react-hook-form';
import './SharepicConfigPopup.css';

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
  success
}: SharepicConfigPopupProps) => {
  if (!isOpen) return null;

  const showAuthorField = watchSharepicType === 'quote' || watchSharepicType === 'quote_pure';
  const showImageUpload = watchSharepicType === 'dreizeilen' || watchSharepicType === 'quote';

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="sharepic-config-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="sharepic-config-modal"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="sharepic-config-header">
              <h3>Sharepic konfigurieren</h3>
              <button
                type="button"
                className="sharepic-config-close"
                onClick={onClose}
                aria-label="Schließen"
              >
                <HiX size={20} />
              </button>
            </div>

            <div className="sharepic-config-content">
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
                      value={sharepicTypeOptions.find(option => option.value === field.value)}
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
                        menuPortal: (base) => ({ ...base, zIndex: 10001 })
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
                      handleChange={handleImageChange}
                      allowedTypes={['.jpg', '.jpeg', '.png', '.webp']}
                      file={uploadedImage}
                      loading={loading}
                      label="Bild für Sharepic (optional)"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="sharepic-config-footer">
              <button
                type="button"
                className="sharepic-config-done"
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
