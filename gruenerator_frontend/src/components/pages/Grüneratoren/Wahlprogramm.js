import React, { useState, useCallback, useContext } from 'react';
import PropTypes from 'prop-types';
import '../../../assets/styles/common/variables.css';
import '../../../assets/styles/common/global.css';
import '../../../assets/styles/components/button.css';
import '../../../assets/styles/pages/baseform.css';
import { useDynamicTextSize } from '../../utils/commonFunctions';
import useApiSubmit from '../../hooks/useApiSubmit';
import BaseForm from '../../common/BaseForm';
import { FormContext } from '../../utils/FormContext';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';
import { useFormValidation } from '../../hooks/useFormValidation';

const Wahlprogrammgenerator = ({ showHeaderFooter = true }) => {
  const [thema, setThema] = useState('');
  const [details, setDetails] = useState('');
  const [zeichenanzahl, setZeichenanzahl] = useState('');
  const [wahlprogramm, setWahlprogramm] = useState('');
  const textSize = useDynamicTextSize(wahlprogramm, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_wahlprogramm');

  const { setGeneratedContent } = useContext(FormContext);

  const validationRules = {
    thema: { 
      required: true,
      message: 'Bitte geben Sie ein Thema an'
    },
    zeichenanzahl: { 
      required: true,
      min: 1000,
      message: 'Die Zeichenanzahl muss mindestens 1000 betragen'
    }
  };

  const { errors, validateForm } = useFormValidation(validationRules);

  const [useBackupProvider, setUseBackupProvider] = useState(false);

  const handleSubmit = useCallback(async () => {
    const formData = { thema, details, zeichenanzahl };
    if (!validateForm(formData)) {
      return;
    }
    console.log('Submitting form with data:', formData);
    try {
      const content = await submitForm(formData, useBackupProvider);
      if (content) {
        console.log('Form submitted successfully. Received content:', content);
        setWahlprogramm(content);
        setGeneratedContent(content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  }, [thema, details, zeichenanzahl, submitForm, resetSuccess, setGeneratedContent, validateForm, useBackupProvider]);

  const handleGeneratedContentChange = useCallback((content) => {
    console.log('Generated content changed:', content);
    setWahlprogramm(content);
  }, []);

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title="Grünerator für Wahlprogramm-Kapitel"
        onSubmit={handleSubmit}
        loading={loading}
        success={success}
        error={error}
        generatedContent={wahlprogramm}
        textSize={textSize}
        onGeneratedContentChange={handleGeneratedContentChange}
        validationErrors={errors}
        useBackupProvider={useBackupProvider}
        setUseBackupProvider={setUseBackupProvider}
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
          style={{ height: '120px' }}
          placeholder={FORM_PLACEHOLDERS.DETAILS}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          aria-required="true"
        ></textarea>

        <h3><label htmlFor="zeichenanzahl">{FORM_LABELS.CHARACTER_COUNT}</label></h3>
        <input
          id="zeichenanzahl"
          type="number"
          name="zeichenanzahl"
          placeholder={FORM_PLACEHOLDERS.CHARACTER_COUNT}
          value={zeichenanzahl}
          onChange={(e) => setZeichenanzahl(e.target.value)}
          aria-required="true"
        />
      </BaseForm>
    </div>
  );
};

Wahlprogrammgenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default Wahlprogrammgenerator;