import React, { forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import Icon from '../../../../components/common/Icon';
import SharepicConfigPopup from '../SharepicConfigPopup';

/**
 * Form data structure for Sharepic configuration
 */
export interface SharepicFormData {
  sharepicType: string;
  zitatAuthor: string;
  uploadedImage: File | null;
}

/**
 * Props for SharepicForm component
 */
interface SharepicFormProps {
  /**
   * Default values for form fields
   */
  defaultValues?: Partial<SharepicFormData>;

  /**
   * Whether sharepic platform is currently selected
   */
  isVisible: boolean;

  /**
   * Available sharepic type options
   */
  sharepicTypeOptions: Array<{
    value: string;
    label: string;
  }>;

  /**
   * Whether the form is in loading state
   */
  loading?: boolean;

  /**
   * Whether submission was successful
   */
  success?: boolean;

  /**
   * React-hook-form control and methods from parent
   * Required for SharepicConfigPopup compatibility
   */
  control?: unknown;
  setValue?: (name: string, value: unknown) => void;
  getValues?: (name?: string) => unknown;
}

/**
 * FormRef interface for imperative handle
 * Allows parent to access form data
 */
export interface SharepicFormRef {
  getFormData: () => SharepicFormData;
  resetForm: (data?: Partial<SharepicFormData>) => void;
}

/**
 * SharepicForm - Configuration UI for sharepic generation
 *
 * Extracted from PresseSocialGenerator for Form Ref pattern.
 * Provides a config button that opens SharepicConfigPopup modal.
 * Only shown when "sharepic" platform is selected.
 *
 * @example
 * ```tsx
 * const formRef = useRef<SharepicFormRef>(null);
 *
 * const handleSubmit = () => {
 *   const data = formRef.current?.getFormData();
 *   console.log(data?.sharepicType, data?.uploadedImage);
 * };
 * ```
 */
const SharepicForm = forwardRef<SharepicFormRef, SharepicFormProps>(
  (
    {
      defaultValues = {},
      isVisible,
      sharepicTypeOptions,
      loading,
      success,
      control,
      setValue,
      getValues
    },
    ref
  ) => {
    // Local state for form data
    const [sharepicType, setSharepicType] = useState<string>(
      defaultValues.sharepicType || 'default'
    );
    const [zitatAuthor, setZitatAuthor] = useState<string>(
      defaultValues.zitatAuthor || ''
    );
    const [uploadedImage, setUploadedImage] = useState<File | null>(
      defaultValues.uploadedImage || null
    );

    // Modal state
    const [showSharepicConfig, setShowSharepicConfig] = useState(false);

    // Handle image change from config popup
    const handleImageChange = useCallback((file: File | null) => {
      setUploadedImage(file);
      if (setValue) {
        setValue('uploadedImage', file);
      }
    }, [setValue]);

    // Expose form data to parent component
    useImperativeHandle(
      ref,
      () => ({
        getFormData: () => ({
          sharepicType,
          zitatAuthor,
          uploadedImage
        }),
        resetForm: (data?: Partial<SharepicFormData>) => {
          if (data) {
            if (data.sharepicType !== undefined) {
              setSharepicType(data.sharepicType);
            }
            if (data.zitatAuthor !== undefined) {
              setZitatAuthor(data.zitatAuthor);
            }
            if (data.uploadedImage !== undefined) {
              setUploadedImage(data.uploadedImage);
            }
          } else {
            setSharepicType('default');
            setZitatAuthor('');
            setUploadedImage(null);
          }
        }
      }),
      [sharepicType, zitatAuthor, uploadedImage]
    );

    if (!isVisible) {
      return null;
    }

    return (
      <>
        <button
          type="button"
          onClick={() => setShowSharepicConfig(true)}
          className="sharepic-config-button"
          title="Sharepic konfigurieren"
        >
          <Icon category="platforms" name="sharepic" size={18} />
        </button>

        <SharepicConfigPopup
          isOpen={showSharepicConfig}
          onClose={() => setShowSharepicConfig(false)}
          control={control}
          setValue={setValue}
          getValues={getValues}
          sharepicTypeOptions={sharepicTypeOptions}
          watchSharepicType={sharepicType}
          uploadedImage={uploadedImage}
          handleImageChange={handleImageChange}
          loading={loading}
          success={success}
        />
      </>
    );
  }
);

SharepicForm.displayName = 'SharepicForm';

export default SharepicForm;
