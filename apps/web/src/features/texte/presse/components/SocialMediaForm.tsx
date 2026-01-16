import React, { forwardRef, useImperativeHandle } from 'react';
import { useForm } from 'react-hook-form';
import { FormTextarea } from '../../../../components/common/Form/Input';
import { FORM_PLACEHOLDERS } from '../../../../components/utils/constants';

/**
 * Form data structure for social media content
 * Note: platforms are managed by parent component
 */
export interface SocialMediaFormData {
  inhalt: string;
}

/**
 * Props for SocialMediaForm component
 */
interface SocialMediaFormProps {
  /**
   * Default values for form fields
   */
  defaultValues?: Partial<SocialMediaFormData>;

  /**
   * Tab indices for accessibility
   */
  tabIndex?: {
    inhalt?: number;
    [key: string]: number | undefined;
  };

  /**
   * Callback when URLs are detected in content
   */
  onUrlsDetected?: (urls: string[]) => void;
}

/**
 * FormRef interface for imperative handle
 * Allows parent to access form data and validation
 */
export interface SocialMediaFormRef {
  getFormData: () => SocialMediaFormData;
  isValid: () => boolean;
}

/**
 * SocialMediaForm - Child form for social media content input
 *
 * Extracted from PresseSocialGenerator for Form Ref pattern.
 * Handles the main content input (platforms managed by parent).
 *
 * @example
 * ```tsx
 * const formRef = useRef<SocialMediaFormRef>(null);
 *
 * const handleSubmit = () => {
 *   if (formRef.current?.isValid()) {
 *     const data = formRef.current.getFormData();
 *     console.log(data.inhalt);
 *   }
 * };
 * ```
 */
const SocialMediaForm = forwardRef<SocialMediaFormRef, SocialMediaFormProps>(
  ({ defaultValues = {}, tabIndex = {}, onUrlsDetected }, ref) => {
    const {
      control,
      getValues,
      formState: { errors }
    } = useForm<SocialMediaFormData>({
      defaultValues: {
        inhalt: defaultValues.inhalt || ''
      }
    });

    // Expose form data and validation to parent component
    useImperativeHandle(
      ref,
      () => ({
        getFormData: () => {
          const formData = getValues();
          return {
            inhalt: formData.inhalt || ''
          };
        },
        isValid: () => {
          const formData = getValues();
          const hasContent = formData.inhalt && formData.inhalt.trim().length > 0;
          return Boolean(hasContent);
        }
      }),
      [getValues]
    );

    return (
      <FormTextarea
        name="inhalt"
        label="Inhalt"
        control={control as any}
        placeholder={FORM_PLACEHOLDERS.INHALT}
        rules={{ required: 'Inhalt ist ein Pflichtfeld' }}
        minRows={5}
        maxRows={15}
        className="form-textarea-large"
        tabIndex={tabIndex.inhalt}
        enableUrlDetection={true}
        onUrlsDetected={onUrlsDetected}
        enableTextAutocomplete={false}
        autocompleteAddHashtag={false}
      />
    );
  }
);

SocialMediaForm.displayName = 'SocialMediaForm';

export default SocialMediaForm;
