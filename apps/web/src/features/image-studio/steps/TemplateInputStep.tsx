import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { HiArrowLeft, HiCog } from 'react-icons/hi';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import Button from '../../../components/common/SubmitButton';
import ConfigDrivenFields from '../components/ConfigDrivenFields';
import { TypeformWizard } from '../../../components/common/Form';
import { getTypeConfig, getTemplateFieldConfig, IMAGE_STUDIO_TYPES } from '../utils/typeConfig';

import './TemplateInputStep.css';

/**
 * TemplateInputStep - Input form for template types
 * Uses config-driven fields for thema, details, name, etc.
 *
 * @param {boolean} typeformMode - When true, shows one field at a time (Typeform-style)
 */
const TemplateInputStep = ({ onSubmit, onBack, loading = false, error = null, typeformMode = false }) => {
  const {
    type,
    thema,
    name,
    handleChange
  } = useImageStudioStore();

  const { user } = useOptimizedAuth();
  const [formErrors, setFormErrors] = useState({});

  // Prefill name with user's full name for ZITAT types
  useEffect(() => {
    if (!name && user && (type === IMAGE_STUDIO_TYPES.ZITAT || type === IMAGE_STUDIO_TYPES.ZITAT_PURE)) {
      const fullName = (user as any).display_name || (user as any).name || '';
      if (fullName) {
        handleChange({ target: { name: 'name', value: fullName } } as React.ChangeEvent<HTMLInputElement>);
      }
    }
  }, [user, type, name, handleChange]);

  const typeConfig = useMemo(() => getTypeConfig(type), [type]);
  const fieldConfig = useMemo(() => getTemplateFieldConfig(type), [type]);

  const values = useMemo(() => ({
    thema,
    name
  }), [thema, name]);

  const validateForm = useCallback(() => {
    const errors = {};

    if (fieldConfig?.inputFields) {
      fieldConfig.inputFields.forEach(field => {
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

  if (typeformMode) {
    return (
      <motion.div
        className="template-input-step template-input-step--typeform"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <TypeformWizard
          fields={fieldConfig?.inputFields || []}
          values={values}
          onChange={handleChange}
          errors={formErrors}
          disabled={loading}
          onComplete={handleTypeformComplete}
          onBack={onBack}
        />

        {error && (
          <p className="error-message typeform-global-error" role="alert">{error}</p>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      className="template-input-step"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="template-input-step__form form-card form-card--elevated">
        <h2 className="template-input-step__title">{typeConfig?.label || 'Sharepic erstellen'}</h2>

        <ConfigDrivenFields
          fields={fieldConfig?.inputFields || []}
          values={values}
          onChange={handleChange}
          errors={formErrors}
          disabled={loading}
        />

        {error && (
          <p className="error-message" role="alert">{error}</p>
        )}

        <div className="template-input-step__actions">
          <Button
            onClick={onBack}
            text="Zurück"
            icon={<HiArrowLeft />}
            className="submit-button"
            ariaLabel="Zurück"
          />
          <Button
            onClick={handleSubmit}
            loading={loading}
            text="Grünerieren"
            icon={<HiCog />}
            className="form-button"
            ariaLabel="Text generieren"
          />
        </div>
      </div>
    </motion.div>
  );
};

export default TemplateInputStep;
