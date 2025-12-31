import React, { useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { HiArrowLeft, HiArrowRight } from 'react-icons/hi';
import useImageStudioStore from '../../../stores/imageStudioStore';
import Button from '../../../components/common/SubmitButton';
import { SloganAlternativesDisplay } from '../components/SloganAlternatives';
import { getTemplateFieldConfig } from '../utils/typeConfig';

import '../../../assets/styles/components/image-studio/typeform-fields.css';
import './TemplatePreviewStep.css';

/**
 * TemplatePreviewStep - Pick a text alternative, then click Weiter to proceed
 */
const TemplatePreviewStep = ({ onSubmit, loading = false }) => {
  const {
    type,
    line1, line2, line3,
    quote,
    header, subheader, body,
    sloganAlternatives,
    handleChange,
    goBack
  } = useImageStudioStore();

  const fieldConfig = useMemo(() => getTemplateFieldConfig(type), [type]);

  const currentSlogan = useMemo(() => {
    if (!fieldConfig?.resultFields) return {};
    const values = { line1, line2, line3, quote, header, subheader, body };
    return fieldConfig.resultFields.reduce((acc, field) => {
      acc[field] = values[field] || '';
      return acc;
    }, {});
  }, [fieldConfig, line1, line2, line3, quote, header, subheader, body]);

  const handleSloganSelect = useCallback((selected) => {
    if (fieldConfig?.alternativesMapping) {
      const mapped = fieldConfig.alternativesMapping(selected);
      Object.entries(mapped).forEach(([key, value]) => {
        handleChange({ target: { name: key, value } });
      });
    }
  }, [fieldConfig, handleChange]);

  return (
    <motion.div
      className="typeform-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="typeform-content">
        <div className="typeform-question">
          <span className="typeform-question__text">Wähle einen Text aus</span>
        </div>

        <SloganAlternativesDisplay
          currentSlogan={currentSlogan}
          alternatives={sloganAlternatives || []}
          onSloganSelect={handleSloganSelect}
          loading={loading}
        />

        <div className="template-input-step__actions">
          <Button
            onClick={goBack}
            text="Zurück"
            icon={<HiArrowLeft />}
            className="submit-button"
            ariaLabel="Zurück"
          />
          <Button
            onClick={onSubmit}
            loading={loading}
            text="Weiter"
            icon={<HiArrowRight />}
            className="form-button"
            ariaLabel="Weiter"
          />
        </div>
      </div>
    </motion.div>
  );
};

export default TemplatePreviewStep;
