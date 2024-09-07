import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import '../../../assets/styles/common/variables.css';
import '../../../assets/styles/common/global.css';
import '../../../assets/styles/components/button.css';
import '../../../assets/styles/pages/baseform.css';
import { useDynamicTextSize } from '../../utils/commonFunctions';
import useApiSubmit from '../../hooks/useApiSubmit';
import BaseForm from '../../common/BaseForm';
import { useFormState } from '../../hooks/useFormState';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';

const Antragsgenerator = ({ showHeaderFooter = true }) => {
  const initialState = {
    idee: '',
    details: '',
    gliederung: '',
    antrag: ''
  };

  const {
    formData,
    loading,
    success,
    error,
    handleChange,
    setLoading,
    setError,
    setSuccess,
    setFormData
  } = useFormState(initialState);

  const textSize = useDynamicTextSize(formData.antrag, 1.2, 0.8, [1000, 2000]);
  const { submitForm } = useApiSubmit('/claude');

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const content = await submitForm(formData);
      if (content) {
        setFormData(prevState => ({ ...prevState, antrag: content }));
        setSuccess(true);
        // Reset success after 3 seconds to match SubmitButton animation duration
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [formData, setLoading, setError, setSuccess, setFormData, submitForm]);

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title="Grünerator für Anträge"
        onSubmit={handleSubmit}
        loading={loading}
        success={success}
        error={error}
        generatedContent={formData.antrag}
        textSize={textSize}
      >
        <h3><label htmlFor="idee">{FORM_LABELS.IDEE}</label></h3>
        <input
          id="idee"
          type="text"
          name="idee"
          placeholder={FORM_PLACEHOLDERS.IDEE}
          value={formData.idee}
          onChange={handleChange}
          aria-required="true"
        />
        
        <h3><label htmlFor="details">{FORM_LABELS.DETAILS}</label></h3>
        <textarea
          id="details"
          name="details"
          style={{ height: '120px' }}
          placeholder={FORM_PLACEHOLDERS.DETAILS}
          value={formData.details}
          onChange={handleChange}
          aria-required="true"
        ></textarea>
        
        <h3><label htmlFor="gliederung">{FORM_LABELS.GLIEDERUNG}</label></h3>
        <input
          id="gliederung"
          type="text"
          name="gliederung"
          placeholder={FORM_PLACEHOLDERS.GLIEDERUNG}
          value={formData.gliederung}
          onChange={handleChange}
          aria-required="true"
        />
      </BaseForm>
    </div>
  );
};

Antragsgenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default Antragsgenerator;