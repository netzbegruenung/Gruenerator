import React, { useState, useCallback, useContext } from 'react';
import PropTypes from 'prop-types';
// import { useDynamicTextSize } from '../../utils/commonFunctions';
import useApiSubmit from '../../hooks/useApiSubmit';
import BaseForm from '../../common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';
import { FormContext } from '../../utils/FormContext';

const Antragsgenerator = ({ showHeaderFooter = true }) => {
  const [idee, setIdee] = useState('');
  const [details, setDetails] = useState('');
  const [gliederung, setGliederung] = useState('');
  const [antrag, setAntrag] = useState('');

  // const textSize = useDynamicTextSize(antrag, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude');
  const { setGeneratedContent } = useContext(FormContext);

  const handleSubmit = useCallback(async () => {
    const formData = { idee, details, gliederung };
    try {
      const content = await submitForm(formData);
      if (content) {
        setAntrag(content);
        setGeneratedContent(content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (error) {
      // Error handling
    }
  }, [idee, details, gliederung, submitForm, resetSuccess, setGeneratedContent]);

  const handleGeneratedContentChange = useCallback((content) => {
    setAntrag(content);
    setGeneratedContent(content);
  }, [setGeneratedContent]);

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title="Grünerator für Anträge"
        onSubmit={handleSubmit}
        loading={loading}
        success={success}
        error={error}
        generatedContent={antrag}

        onGeneratedContentChange={handleGeneratedContentChange}
      >
        <h3><label htmlFor="idee">{FORM_LABELS.IDEE}</label></h3>
        <input
          id="idee"
          type="text"
          name="idee"
          placeholder={FORM_PLACEHOLDERS.IDEE}
          value={idee}
          onChange={(e) => setIdee(e.target.value)}
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
        
        <h3><label htmlFor="gliederung">{FORM_LABELS.GLIEDERUNG}</label></h3>
        <input
          id="gliederung"
          type="text"
          name="gliederung"
          placeholder={FORM_PLACEHOLDERS.GLIEDERUNG}
          value={gliederung}
          onChange={(e) => setGliederung(e.target.value)}
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
