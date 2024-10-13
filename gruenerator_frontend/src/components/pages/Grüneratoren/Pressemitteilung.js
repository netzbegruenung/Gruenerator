// src/components/pages/Pressemitteilungsgenerator.js
import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import '../../../assets/styles/common/variables.css';
import '../../../assets/styles/common/global.css';
import '../../../assets/styles/components/button.css';
import '../../../assets/styles/pages/baseform.css';
import { useDynamicTextSize } from '../../utils/commonFunctions';
import useApiSubmit from '../../hooks/useApiSubmit';
import BaseForm from '../../common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';

const Pressemitteilungsgenerator = ({ showHeaderFooter = true }) => {
  const [was, setWas] = useState('');
  const [wie, setWie] = useState('');
  const [zitatgeber, setZitatgeber] = useState('');
  const [pressekontakt, setPressekontakt] = useState('');
  const [pressemitteilung, setPressemitteilung] = useState('');
  const textSize = useDynamicTextSize(pressemitteilung, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_presse');

  const handleSubmit = useCallback(async () => {
    const formData = { was, wie, zitatgeber, pressekontakt };
    console.log('Submitting form with data:', formData);
    try {
      const content = await submitForm(formData);
      if (content) {
        console.log('Form submitted successfully. Received content:', content);
        setPressemitteilung(content);
        // Reset success after 3 seconds to match SubmitButton animation duration
        setTimeout(resetSuccess, 3000);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      // Optionally set an error state or show a notification to the user
    }
  }, [was, wie, zitatgeber, pressekontakt, submitForm, resetSuccess]);

  // Debugging: Log when onGeneratedContentChange is called
  const handleGeneratedContentChange = (content) => {
    console.log('Generated content changed:', content);
    setPressemitteilung(content);
  };

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title="Grünerator für Pressemitteilungen"
        onSubmit={handleSubmit}
        loading={loading}
        success={success}
        error={error}
        generatedContent={pressemitteilung}
        textSize={textSize}
        onGeneratedContentChange={handleGeneratedContentChange}
      >
        <h3><label htmlFor="was">{FORM_LABELS.WHAT}</label></h3>
        <input
          id="was"
          type="text"
          name="was"
          placeholder={FORM_PLACEHOLDERS.WHAT}
          value={was}
          onChange={(e) => setWas(e.target.value)}
          aria-required="true"
        />
        
        <h3><label htmlFor="wie">{FORM_LABELS.DETAILS_ALL}</label></h3>
        <textarea
          id="wie"
          name="wie"
          style={{ height: '120px' }}
          placeholder={FORM_PLACEHOLDERS.DETAILS_ALL}
          value={wie}
          onChange={(e) => setWie(e.target.value)}
          aria-required="true"
        ></textarea>
        
        <h3><label htmlFor="zitatgeber">{FORM_LABELS.WHO_QUOTE}</label></h3>
        <p className="subtext">Mehrere Personen können genannt werden.</p>
        <input
          id="zitatgeber"
          type="text"
          name="zitatgeber"
          placeholder={FORM_PLACEHOLDERS.WHO_QUOTE}
          value={zitatgeber}
          onChange={(e) => setZitatgeber(e.target.value)}
          aria-required="true"
        />
        
        <h3><label htmlFor="pressekontakt">{FORM_LABELS.PRESS_CONTACT}</label></h3>
        <textarea
          id="pressekontakt"
          name="pressekontakt"
          placeholder={FORM_PLACEHOLDERS.PRESS_CONTACT}
          value={pressekontakt}
          onChange={(e) => setPressekontakt(e.target.value)}
          aria-required="true"
        ></textarea>
      </BaseForm>
    </div>
  );
};

Pressemitteilungsgenerator.propTypes = {
  showHeaderFooter: PropTypes.bool,
};

export default Pressemitteilungsgenerator;
