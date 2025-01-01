import React, { useState, useCallback, useContext } from 'react';
import PropTypes from 'prop-types';
import '../../../assets/styles/common/variables.css';
import '../../../assets/styles/common/global.css';
import '../../../assets/styles/components/button.css';
import '../../../assets/styles/pages/baseform.css';
import { useDynamicTextSize } from '../../utils/commonFunctions';
import useApiSubmit from '../../hooks/useApiSubmit';
import BaseForm from '../../common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';
import { FormContext } from '../../utils/FormContext';

const UniversalGenerator = ({ showHeaderFooter = true }) => {
  // State Management
  const [textForm, setTextForm] = useState('');
  const [sprache, setSprache] = useState('');
  const [thema, setThema] = useState('');
  const [details, setDetails] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [useBackupProvider, setUseBackupProvider] = useState(false);

  // Hooks
  const textSize = useDynamicTextSize(generatedContent, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_universal');
  const { setGeneratedContent: setContextGeneratedContent } = useContext(FormContext);

  // Handlers
  const handleSubmit = useCallback(async () => {
    const formData = {
      textForm,
      sprache,
      thema,
      details
    };

    try {
      const content = await submitForm(formData, useBackupProvider);
      if (content) {
        setGeneratedContent(content);
        setContextGeneratedContent(content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (error) {
      // Error handling
    }
  }, [textForm, sprache, thema, details, submitForm, resetSuccess, setContextGeneratedContent, useBackupProvider]);

  const handleGeneratedContentChange = useCallback((content) => {
    setGeneratedContent(content);
    setContextGeneratedContent(content);
  }, [setContextGeneratedContent]);

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title="Universal Grünerator"
        onSubmit={handleSubmit}
        loading={loading}
        success={success}
        error={error}
        generatedContent={generatedContent}
        textSize={textSize}
        onGeneratedContentChange={handleGeneratedContentChange}
        useBackupProvider={useBackupProvider}
        setUseBackupProvider={setUseBackupProvider}
      >
        <h3><label htmlFor="textForm">Textform</label></h3>
        <input
          id="textForm"
          type="text"
          name="textForm"
          placeholder="z.B. Antrag, Pressemitteilung, Social Media Post, Rede..."
          value={textForm}
          onChange={(e) => setTextForm(e.target.value)}
          aria-required="true"
        />

        <h3><label htmlFor="sprache">Sprache & Stil</label></h3>
        <input
          id="sprache"
          type="text"
          name="sprache"
          placeholder="z.B. formal, sachlich, emotional, aktivierend..."
          value={sprache}
          onChange={(e) => setSprache(e.target.value)}
          aria-required="true"
        />

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
      </BaseForm>
    </div>
  );
};

UniversalGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default UniversalGenerator; 