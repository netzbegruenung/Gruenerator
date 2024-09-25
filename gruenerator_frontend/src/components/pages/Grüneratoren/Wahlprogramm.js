import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import '../../../assets/styles/common/variables.css';
import '../../../assets/styles/common/global.css';
import '../../../assets/styles/components/button.css';
import '../../../assets/styles/pages/baseform.css';
import { useDynamicTextSize } from '../../utils/commonFunctions';
import useApiSubmit from '../../hooks/useApiSubmit';
import BaseForm from '../../common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS, WAHLPROGRAMM_GENERATOR } from '../../utils/constants';

const Wahlprogramm = ({ showHeaderFooter = true }) => {
  const [thema, setThema] = useState('');
  const [details, setDetails] = useState('');
  const [ort, setOrt] = useState('');
  const [gliederung, setGliederung] = useState('');
  const [zeichenzahl, setZeichenzahl] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const textSize = useDynamicTextSize(generatedContent, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('generate-wahlprogramm');

  const handleSubmit = useCallback(async () => {
    const formData = { thema, details, ort, gliederung, zeichenzahl };
    try {
      console.log('Submitting form data:', formData);
      const response = await submitForm(formData);
      console.log('Received response:', response);
      if (response && response.generatedContent) {
        setGeneratedContent(response.generatedContent);
        setTimeout(resetSuccess, 3000);
      } else {
        throw new Error('Unerwartetes Antwortformat');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  }, [thema, details, ort, gliederung, zeichenzahl, submitForm, resetSuccess]);

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title={WAHLPROGRAMM_GENERATOR.TITLE}
        subtitle={WAHLPROGRAMM_GENERATOR.SUBTITLE}
        onSubmit={handleSubmit}
        loading={loading}
        success={success}
        error={error}
        generatedContent={generatedContent}
        textSize={textSize}
      >
        <h3><label htmlFor="thema">{FORM_LABELS.THEME}</label></h3>
        <input
          id="thema"
          type="text"
          name="thema"
          placeholder={FORM_PLACEHOLDERS.THEME}
          value={thema}
          onChange={(e) => setThema(e.target.value)}
          aria-required="true"
        />

        <h3><label htmlFor="details">{FORM_LABELS.DETAILS}</label></h3>
        <textarea
          id="details"
          name="details"
          placeholder={FORM_PLACEHOLDERS.DETAILS}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          aria-required="true"
        ></textarea>

        <h3><label htmlFor="ort">{FORM_LABELS.LOCATION}</label></h3>
        <input
          id="ort"
          type="text"
          name="ort"
          placeholder={FORM_PLACEHOLDERS.LOCATION}
          value={ort}
          onChange={(e) => setOrt(e.target.value)}
          aria-required="true"
        />

        <h3><label htmlFor="gliederung">{FORM_LABELS.ORGANIZATION}</label></h3>
        <input
          id="gliederung"
          type="text"
          name="gliederung"
          placeholder={FORM_PLACEHOLDERS.ORGANIZATION}
          value={gliederung}
          onChange={(e) => setGliederung(e.target.value)}
          aria-required="true"
        />

        <h3><label htmlFor="zeichenzahl">{FORM_LABELS.CHARACTER_COUNT}</label></h3>
        <input
          id="zeichenzahl"
          type="number"
          name="zeichenzahl"
          placeholder={FORM_PLACEHOLDERS.CHARACTER_COUNT}
          value={zeichenzahl}
          onChange={(e) => setZeichenzahl(e.target.value)}
          aria-required="true"
        />
      </BaseForm>
    </div>
  );
};

Wahlprogramm.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default Wahlprogramm;