import { motion } from 'motion/react';
import React, { useState, useCallback, useMemo, useEffect, ChangeEvent } from 'react';
import { HiArrowLeft, HiCog } from 'react-icons/hi';

import { TypeformWizard } from '../../../components/common/Form';
import Button from '../../../components/common/SubmitButton';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import useImageStudioStore from '../../../stores/imageStudioStore';
import ConfigDrivenFields from '../components/ConfigDrivenFields';
import { getTypeConfig, getTemplateFieldConfig, IMAGE_STUDIO_TYPES } from '../utils/typeConfig';

import type { TypeformField } from '../../../components/common/Form';

interface TemplateInputStepProps {
  onSubmit: () => void;
  onBack: () => void;
  loading?: boolean;
  error?: string | null;
  typeformMode?: boolean;
}

/**
 * TemplateInputStep - Input form for template types
 * Uses config-driven fields for thema, details, name, etc.
 *
 * @param {boolean} typeformMode - When true, shows one field at a time (Typeform-style)
 */
const TemplateInputStep: React.FC<TemplateInputStepProps> = ({
  onSubmit,
  onBack,
  loading = false,
  error = null,
  typeformMode = false,
}) => {
  const { type, thema, name, handleChange } = useImageStudioStore();

  const { user } = useOptimizedAuth();
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Prefill name with user's full name for ZITAT types
  useEffect(() => {
    if (
      !name &&
      user &&
      (type === IMAGE_STUDIO_TYPES.ZITAT || type === IMAGE_STUDIO_TYPES.ZITAT_PURE)
    ) {
      const fullName =
        (user as unknown as { display_name?: string; name?: string }).display_name ||
        (user as unknown as { display_name?: string; name?: string }).name ||
        '';
      if (fullName) {
        handleChange({
          target: { name: 'name', value: fullName },
        } as React.ChangeEvent<HTMLInputElement>);
      }
    }
  }, [user, type, name, handleChange]);

  const typeConfig = useMemo(() => (type ? getTypeConfig(type) : null), [type]);
  const fieldConfig = useMemo(() => (type ? getTemplateFieldConfig(type) : null), [type]);

  const values = useMemo<Record<string, string>>(
    () => ({
      thema: thema || '',
      name: name || '',
      type: type || '',
    }),
    [thema, name, type]
  );

  const validateForm = useCallback(() => {
    const errors: Record<string, string> = {};

    if (fieldConfig?.inputFields) {
      fieldConfig.inputFields.forEach((field) => {
        const value = values[field.name] || '';
        if (field.required && !value.trim()) {
          errors[field.name] = `${field.label} ist erforderlich`;
        } else if (field.minLength && value.trim().length < field.minLength) {
          errors[field.name] = `${field.label} muss mindestens ${field.minLength} Zeichen haben`;
        }
      });
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [fieldConfig, values]);

  const handleSubmit = useCallback(() => {
    if (!validateForm()) return;
    onSubmit();
  }, [validateForm, onSubmit]);

  const handleTypeformComplete = useCallback(() => {
    onSubmit();
  }, [onSubmit]);

  // Adapter for handleChange to match ConfigDrivenFields and TypeformWizard expectations
  const handleFieldChange = useCallback(
    (
      e:
        | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
        | { target: { name: string; value: string } }
    ) => {
      handleChange(e as React.ChangeEvent<HTMLInputElement>);
    },
    [handleChange]
  );

  if (typeformMode) {
    return (
      <motion.div
        className="flex flex-col gap-lg w-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <TypeformWizard
          fields={(fieldConfig?.inputFields || []) as TypeformField[]}
          values={values}
          onChange={handleFieldChange}
          errors={formErrors}
          disabled={loading}
          onComplete={handleTypeformComplete}
          onBack={onBack}
        />

        {error && (
          <p className="error-message typeform-global-error" role="alert">
            {error}
          </p>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex flex-col gap-lg w-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex flex-col gap-md p-lg max-w-[600px] mx-auto w-full bg-background-alt border border-grey-200 dark:border-grey-700 rounded-md shadow-card-elevated overflow-hidden transition-all md:max-w-full md:p-md">
        <h2 className="m-0 mb-xs text-xl font-semibold text-foreground">
          {typeConfig?.label || 'Sharepic erstellen'}
        </h2>

        <ConfigDrivenFields
          fields={fieldConfig?.inputFields || []}
          values={values}
          onChange={handleFieldChange}
          errors={formErrors}
          disabled={loading}
        />

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-md mt-md max-[768px]:flex-col">
          <Button onClick={onBack} text="Zurück" icon={<HiArrowLeft />} ariaLabel="Zurück" />
          <Button
            onClick={handleSubmit}
            loading={loading}
            text="Grünerieren"
            icon={<HiCog />}
            className="flex-1"
            ariaLabel="Text generieren"
          />
        </div>
      </div>
    </motion.div>
  );
};

export default TemplateInputStep;
