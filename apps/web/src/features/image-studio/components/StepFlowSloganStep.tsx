import React, { useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { HiArrowLeft, HiArrowRight } from 'react-icons/hi';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { getTemplateFieldConfig } from '../utils/typeConfig';
import { SloganSelector } from './SloganSelector';
import Button from '../../../components/common/SubmitButton';

import '../../../assets/styles/components/image-studio/typeform-fields.css';

const StepFlowSloganStep = ({
  onNext,
  onBack,
  loading = false,
  direction = 1
}) => {
  const {
    type,
    line1, line2, line3,
    quote,
    header, subheader, body,
    sloganAlternatives,
    handleChange
  } = useImageStudioStore();

  const fieldConfig = useMemo(() => getTemplateFieldConfig(type), [type]);

  const currentSlogan = useMemo(() => {
    if (!fieldConfig?.resultFields) return {} as Record<string, string>;
    const values: Record<string, string> = { line1, line2, line3, quote, header, subheader, body };
    const result: Record<string, string> = {};
    (fieldConfig.resultFields as string[]).forEach((field: string) => {
      result[field] = values[field] || '';
    });
    return result;
  }, [fieldConfig, line1, line2, line3, quote, header, subheader, body]);

  const handleSloganSelect = useCallback((selected: Record<string, string>) => {
    if (fieldConfig?.alternativesMapping) {
      const mapped = fieldConfig.alternativesMapping(selected);
      Object.entries(mapped).forEach(([key, value]) => {
        handleChange({ target: { name: key, value } } as React.ChangeEvent<HTMLInputElement>);
      });
    }
  }, [fieldConfig, handleChange]);

  return (
    <motion.div
      className="typeform-field"
      initial={{ y: direction > 0 ? 40 : -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: direction < 0 ? 40 : -40, opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className="typeform-input-wrapper typeform-input-wrapper--slogan">
        <SloganSelector
          currentSlogan={currentSlogan}
          alternatives={sloganAlternatives || []}
          onSelect={handleSloganSelect}
          loading={loading}
        />
      </div>

      <div className="template-input-step__actions">
        <Button
          onClick={onBack}
          text="Zurück"
          icon={<HiArrowLeft />}
          className="btn-secondary"
          ariaLabel="Zurück"
        />
        <Button
          onClick={onNext}
          loading={loading}
          text="Weiter"
          icon={<HiArrowRight />}
          className="btn-primary"
          ariaLabel="Weiter"
        />
      </div>
    </motion.div>
  );
};

export default StepFlowSloganStep;
