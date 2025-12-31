import React, { forwardRef, memo, ReactNode } from 'react';
import { FormProvider, Control, FieldValues, UseFormReturn } from 'react-hook-form';
import SubmitButton from '../../SubmitButton';
import PlatformSelector from '../../../common/PlatformSelector';
import FileUpload from '../../../common/FileUpload';
import { useBaseForm } from '../hooks';
import type { FormInputSectionProps, PlatformOption, FormControl } from '@/types/baseform';

const hasFormErrors = (formErrors: Record<string, string> = {}): boolean =>
  Object.keys(formErrors).length > 0;

const getFormContentClasses = (hasErrors: boolean): string =>
  `form-content ${hasErrors ? 'has-errors' : ''}`;

const getButtonContainerClasses = (showBackButton?: boolean): string =>
  `button-container ${showBackButton ? 'form-buttons' : ''}`;

interface FormChildrenProps {
  control: Control<FieldValues>;
  errors: Record<string, unknown>;
  formData: Record<string, unknown>;
  handleChange: (name: string, value: unknown) => void;
  [key: string]: unknown;
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
  isStartMode = false
}, ref) => {
  const formContentClasses = getFormContentClasses(hasFormErrors(formErrors as Record<string, string>));
  const buttonContainerClasses = getButtonContainerClasses(showBackButton);

  const modernForm = useBaseForm({
    defaultValues,
    validationRules,
    enableLegacyMode: true
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
                errors: modernForm.errors,
                formData: modernForm.formData,
                handleChange: handleFormChange,
                ...modernForm
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
                handleChange={onImageChange}
                allowedTypes={['.jpg', '.jpeg', '.png', '.webp']}
                file={uploadedImage}
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
                onClick={onSubmit}
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
