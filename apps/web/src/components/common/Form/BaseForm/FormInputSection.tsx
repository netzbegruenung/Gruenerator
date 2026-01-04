import React, { forwardRef, memo, ReactNode } from 'react';
import { FormProvider, Control, FieldValues, useForm } from 'react-hook-form';
import SubmitButton from '../../SubmitButton';
import PlatformSelector from '../../../common/PlatformSelector';
import FileUpload from '../../../common/FileUpload';
import type { FormInputSectionProps, PlatformOption, FormControl } from '@/types/baseform';

const hasFormErrors = (formErrors: Record<string, string> = {}): boolean =>
  Object.keys(formErrors).length > 0;

const getFormContentClasses = (hasErrors: boolean): string =>
  `form-content ${hasErrors ? 'has-errors' : ''}`;

const getButtonContainerClasses = (showBackButton?: boolean): string =>
  `button-container ${showBackButton ? 'form-buttons' : ''}`;

interface FormInputSectionProps {
  useModernForm?: boolean;
  defaultValues?: Record<string, unknown>;
  validationRules?: Record<string, unknown>;
  formControl?: FormControl | null;
  onFormChange?: ((values: Record<string, unknown>) => void) | null;
  onSubmit?: ((data?: Record<string, unknown>) => void | Promise<void>) | (() => void);
  showSubmitButton?: boolean;
  nextButtonText?: string | null;
  submitButtonProps?: Record<string, unknown>;
  isMultiStep?: boolean;
  onBack?: () => void;
  showBackButton?: boolean;
  formErrors?: Record<string, string>;
  children?: ReactNode | ((formControl: FormControl) => ReactNode);
  enablePlatformSelector?: boolean;
  platformOptions?: PlatformOption[];
  platformSelectorLabel?: string;
  platformSelectorPlaceholder?: string;
  platformSelectorHelpText?: string;
  platformSelectorTabIndex?: number;
  showImageUpload?: boolean;
  uploadedImage?: unknown;
  onImageChange?: ((image: unknown) => void) | null;
  isStartMode?: boolean;
  loading?: boolean;
  success?: boolean;
  inputHeaderContent?: ReactNode;
}

const FormInputSection = forwardRef<HTMLDivElement, FormInputSectionProps>(({
  formErrors = {},
  isMultiStep = false,
  onBack,
  showBackButton = false,
  children,
  defaultValues = {},
  validationRules = {},
  useModernForm = true,
  onFormChange = null,
  showSubmitButton = false,
  onSubmit,
  loading = false,
  success = false,
  nextButtonText = null,
  submitButtonProps = {},
  enablePlatformSelector = false,
  platformOptions = [],
  platformSelectorLabel,
  platformSelectorPlaceholder,
  platformSelectorHelpText,
  platformSelectorTabIndex = 12,
  formControl = null,
  showImageUpload = false,
  uploadedImage = null,
  onImageChange = null,
  isStartMode = false,
  inputHeaderContent = null
}, ref) => {
  const formContentClasses = getFormContentClasses(hasFormErrors(formErrors as Record<string, string>));
  const buttonContainerClasses = getButtonContainerClasses(showBackButton);

  const modernForm = useForm({
    defaultValues
  });

  const handleFormChange = (name: string, value: unknown): void => {
    if (useModernForm) {
      modernForm.setValue(name, value);
    }
    if (onFormChange) {
      onFormChange(useModernForm ? modernForm.getValues() : {});
    }
  };

  const renderChildren = (): ReactNode => {
    if (useModernForm) {
      return (
        <FormProvider {...modernForm}>
          {typeof children === 'function'
            ? children({
                control: modernForm.control,
                register: modernForm.register,
                setValue: modernForm.setValue,
                getValues: modernForm.getValues,
                formState: {
                  errors: modernForm.formState.errors,
                  isDirty: modernForm.formState.isDirty,
                  isValid: modernForm.formState.isValid
                }
              } as FormControl)
            : children
          }
        </FormProvider>
      );
    }
    return children as ReactNode;
  };

  return (
    <div className={`form-section__inputs ${isStartMode ? 'form-section__inputs--start-mode' : ''}`} ref={ref}>
      <div className="form-inputs__content">
        {inputHeaderContent && (
          <div className="form-inputs__header">
            {inputHeaderContent}
          </div>
        )}
        <div className={`form-inputs__fields ${formContentClasses}`}>
          {enablePlatformSelector && useModernForm && platformOptions.length > 0 && (
            <div className="form-inputs__platform-selector">
              <PlatformSelector
                name="platforms"
                control={(formControl as FormControl)?.control || modernForm.control}
                platformOptions={platformOptions}
                label={platformSelectorLabel}
                placeholder={platformSelectorPlaceholder}
                required={true}
                helpText={platformSelectorHelpText}
                tabIndex={platformSelectorTabIndex}
              />
            </div>
          )}

          {showImageUpload && (
            <div className="form-inputs__image-upload">
              <FileUpload
                handleChange={(file: File | null) => onImageChange?.(file)}
                allowedTypes={['.jpg', '.jpeg', '.png', '.webp']}
                file={uploadedImage instanceof File ? uploadedImage : null}
                loading={loading}
                label="Bild für Sharepic (optional)"
              />
            </div>
          )}

          {renderChildren()}
        </div>

        {(isMultiStep && showBackButton) || showSubmitButton ? (
          <div className={`form-inputs__buttons ${buttonContainerClasses}`}>
            {isMultiStep && showBackButton && (
              <button
                type="button"
                onClick={onBack}
                className="form-inputs__back-button"
              >
                Zurück
              </button>
            )}
            {showSubmitButton && (
              <SubmitButton
                onClick={(e: React.MouseEvent) => { e.preventDefault(); onSubmit?.(); }}
                loading={loading}
                success={success}
                text={isMultiStep ? (nextButtonText || 'Weiter') : ((submitButtonProps as Record<string, string>)?.defaultText || "Grünerieren")}
                className="form-inputs__submit-button button-primary"
                ariaLabel={isMultiStep ? (nextButtonText || 'Weiter') : "Generieren"}
                type="submit"
                {...submitButtonProps}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
});

FormInputSection.displayName = 'FormInputSection';

export default memo(FormInputSection);
