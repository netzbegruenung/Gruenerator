import React, { useState, useCallback, useContext } from 'react';
import PropTypes from 'prop-types';
import '../../../assets/styles/common/variables.css';
import '../../../assets/styles/common/global.css';
import '../../../assets/styles/components/button.css';
import '../../../assets/styles/pages/baseform.css';
import {useDynamicTextSize } from '../../utils/commonFunctions';
import useApiSubmit from '../../hooks/useApiSubmit';
import BaseForm from '../../common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';
import { FormContext } from '../../utils/FormContext';
import ErrorBoundary from '../../ErrorBoundary';
import BackupToggle from '../../common/BackupToggle';

const WahlpruefsteinThueringen = ({ showHeaderFooter = true }) => {
  const [question, setQuestion] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [response, setResponse] = useState('');
  const textSize = useDynamicTextSize(response, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/wahlpruefsteinthueringen/frage');
  const { setGeneratedContent } = useContext(FormContext);
  const [useBackupProvider, setUseBackupProvider] = useState(false);

  const handleSubmit = useCallback(async () => {
    const formData = { 
      question: question.trim(), 
      sectionIndex: parseInt(selectedSection, 10) 
    };

    try {
      const content = await submitForm(formData, useBackupProvider);
      if (content) {
        setResponse(content);
        setGeneratedContent(content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (error) {
      console.error('Error processing the question:', error);
    }
  }, [question, selectedSection, submitForm, resetSuccess, setGeneratedContent, useBackupProvider]);

  const handleGeneratedContentChange = useCallback((content) => {
    setResponse(content);
    setGeneratedContent(content);
  }, [setGeneratedContent]);

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title="Wahlprüfstein-Generator Thüringen"
          onSubmit={handleSubmit}
          loading={loading}
          success={success}
          error={error}
          generatedContent={response}
          textSize={textSize}
          onGeneratedContentChange={handleGeneratedContentChange}
          useBackupProvider={useBackupProvider}
          setUseBackupProvider={setUseBackupProvider}
        >
          <h3><label htmlFor="question">{FORM_LABELS.QUESTION || 'Stellen Sie Ihre Frage'}</label></h3>
          <textarea
            id="question"
            name="question"
            placeholder={FORM_PLACEHOLDERS.QUESTION || 'Stellen Sie hier Ihre Frage zum Wahlprogramm...'}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            aria-required="true"
            style={{ height: '120px' }}
          />

          <h3><label htmlFor="section">{FORM_LABELS.SECTION || 'Wählen Sie einen Themenbereich'}</label></h3>
          <select
            id="section"
            name="section"
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            aria-required="true"
          >
            <option value="">-- Bitte wählen --</option>
            <option value="0">🌳 Umwelt</option>
            <option value="1">⚖️ Gerechtigkeit</option>
            <option value="2">🌈 Vielfalt/Freiheit</option>
          </select>

          <BackupToggle
            useBackupProvider={useBackupProvider}
            setUseBackupProvider={setUseBackupProvider}
          />
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

WahlpruefsteinThueringen.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default WahlpruefsteinThueringen;