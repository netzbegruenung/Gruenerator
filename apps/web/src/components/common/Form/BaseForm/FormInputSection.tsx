import React, { forwardRef, memo, type ReactNode } from 'react';
import { FormProvider, Control, FieldValues, useForm } from 'react-hook-form';

import FileUpload from '../../../common/FileUpload';
import PlatformSelector from '../../../common/PlatformSelector';
import SubmitButton from '../../SubmitButton';

import type { FormInputSectionProps, PlatformOption, FormControl } from '@/types/baseform';

import { cn } from '@/utils/cn';

const hasFormErrors = (formErrors: Record<string, string> = {}): boolean =>
  Object.keys(formErrors).length > 0;

const getFormContentClasses = (hasErrors: boolean): string =>
  `form-content ${hasErrors ? 'has-errors' : ''}`;

const getButtonContainerClasses = (showBackButton?: boolean): string =>
  `button-container ${showBackButton ? 'form-buttons' : ''}`;

// Property definition is imported from @/types/baseform above

const FormInputSection = forwardRef<HTMLDivElement, FormInputSectionProps>(
  (
    {
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
      inputHeaderContent = null,
    },
    ref
  ) => {
    const formContentClasses = getFormContentClasses(
      hasFormErrors(formErrors as Record<string, string>)
    );
    const buttonContainerClasses = getButtonContainerClasses(showBackButton);

    const modernForm = useForm({
      defaultValues,
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
                    isValid: modernForm.formState.isValid,
                  },
                } as FormControl)
              : children}
          </FormProvider>
        );
      }
      return children as ReactNode;
    };

    return (
      <div className={cn('flex-[2] min-w-0 min-h-0', isStartMode && 'flex-none')} ref={ref}>
        <div className="flex-1 flex flex-col min-h-0">
          {inputHeaderContent && <div className="mb-sm">{inputHeaderContent}</div>}
          <div className={cn('flex-1 mb-lg min-h-0', formContentClasses)}>
            {enablePlatformSelector && useModernForm && platformOptions.length > 0 && (
              <div>
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
              <div>
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
            <div
              className={cn(
                'flex gap-md justify-end items-center pt-md border-t border-grey-200 dark:border-grey-700 mt-auto',
                'max-md:flex-col max-md:gap-sm',
                buttonContainerClasses
              )}
            >
              {isMultiStep && showBackButton && (
                <button
                  type="button"
                  onClick={onBack}
                  className="bg-transparent border-2 border-[var(--interactive-accent-color)] text-[var(--interactive-accent-color)] px-lg py-sm rounded-sm text-[0.9em] cursor-pointer transition-all duration-250 hover:bg-[var(--interactive-accent-color)] hover:text-background-pure focus:outline-2 focus:outline-[var(--interactive-accent-color)] focus:outline-offset-2 max-md:w-full max-md:text-center"
                >
                  Zurück
                </button>
              )}
              {showSubmitButton && (
                <SubmitButton
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    onSubmit?.();
                  }}
                  loading={loading}
                  success={success}
                  text={
                    isMultiStep
                      ? nextButtonText || 'Weiter'
                      : (submitButtonProps as Record<string, string>)?.defaultText || 'Grünerieren'
                  }
                  className="form-inputs__submit-button button-primary"
                  ariaLabel={isMultiStep ? nextButtonText || 'Weiter' : 'Generieren'}
                  type="submit"
                  {...submitButtonProps}
                />
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
);

FormInputSection.displayName = 'FormInputSection';

export default memo(FormInputSection);
