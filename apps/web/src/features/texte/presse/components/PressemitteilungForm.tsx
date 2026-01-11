import React, { forwardRef, useImperativeHandle } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'motion/react';
import SmartInput from '../../../../components/common/Form/SmartInput';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../../components/utils/constants';
import { TabIndexHelpers } from '../../../../utils/tabIndexConfig';

/**
 * Form data structure for Pressemitteilung-specific fields
 */
export interface PressemitteilungFormData {
  zitatgeber: string;
  presseabbinder: string;
}

/**
 * Props for PressemitteilungForm component
 */
interface PressemitteilungFormProps {
  /**
   * Default values for form fields
   */
  defaultValues?: Partial<PressemitteilungFormData>;

  /**
   * Tab indices for accessibility
   */
  tabIndex?: {
    zitatgeber?: number;
    presseabbinder?: number;
    [key: string]: number | undefined;
  };

  /**
   * Whether the form is visible (for conditional rendering)
   * Used for animation and tab index calculation
   */
  isVisible: boolean;

  /**
   * Whether submission was successful (for SmartInput auto-save)
   */
  success?: boolean;
}

/**
 * FormRef interface for imperative handle
 * Allows parent to access form data
 */
export interface PressemitteilungFormRef {
  getFormData: () => PressemitteilungFormData;
  resetForm: (data?: Partial<PressemitteilungFormData>) => void;
}

/**
 * PressemitteilungForm - Conditional fields for press releases
 *
 * Extracted from PresseSocialGenerator for Form Ref pattern.
 * Only shown when "pressemitteilung" platform is selected.
 * Includes animated entry/exit transitions.
 *
 * @example
 * ```tsx
 * const formRef = useRef<PressemitteilungFormRef>(null);
 *
 * const handleSubmit = () => {
 *   const data = formRef.current?.getFormData();
 *   console.log(data?.zitatgeber, data?.presseabbinder);
 * };
 * ```
 */
const PressemitteilungForm = forwardRef<PressemitteilungFormRef, PressemitteilungFormProps>(
  ({ defaultValues = {}, tabIndex = {}, isVisible, success }, ref) => {
    const {
      control,
      getValues,
      setValue,
      reset
    } = useForm<PressemitteilungFormData>({
      defaultValues: {
        zitatgeber: defaultValues.zitatgeber || '',
        presseabbinder: defaultValues.presseabbinder || ''
      },
      shouldUnregister: false // Keep values when hidden
    });

    // Expose form data to parent component
    useImperativeHandle(
      ref,
      () => ({
        getFormData: () => {
          const formData = getValues();
          return {
            zitatgeber: formData.zitatgeber || '',
            presseabbinder: formData.presseabbinder || ''
          };
        },
        resetForm: (data?: Partial<PressemitteilungFormData>) => {
          if (data) {
            reset(data);
          } else {
            reset();
          }
        }
      }),
      [getValues, reset]
    );

    if (!isVisible) {
      return null;
    }

    return (
      <motion.div
        className="press-release-fields"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 25,
          duration: 0.25
        }}
      >
        <h4>Pressemitteilung:</h4>
        <SmartInput
          fieldType="zitatgeber"
          formName="presseSocial"
          name="zitatgeber"
          control={control as never}
          setValue={setValue as never}
          getValues={getValues as never}
          label={FORM_LABELS.WHO_QUOTE}
          subtext="Mehrere Personen können genannt werden."
          placeholder={FORM_PLACEHOLDERS.WHO_QUOTE}
          rules={{}}
          tabIndex={TabIndexHelpers.getConditional(tabIndex.zitatgeber || 0, isVisible)}
          onSubmitSuccess={success ? String(getValues('zitatgeber') || '') : null}
          shouldSave={success}
        />
        <SmartInput
          fieldType="presseabbinder"
          formName="presseSocial"
          name="presseabbinder"
          control={control as never}
          setValue={setValue as never}
          getValues={getValues as never}
          label="Presseabbinder (optional)"
          subtext="Standard-Abbinder, der an die Pressemitteilung angehängt wird (z.B. Kontaktdaten, Vereinsinformationen)."
          placeholder="z.B. Kontakt: Max Mustermann, presse@gruene-example.de"
          tabIndex={TabIndexHelpers.getConditional(tabIndex.presseabbinder || 0, isVisible)}
          onSubmitSuccess={success ? String(getValues('presseabbinder') || '') : null}
          shouldSave={success}
        />
      </motion.div>
    );
  }
);

PressemitteilungForm.displayName = 'PressemitteilungForm';

export default PressemitteilungForm;
