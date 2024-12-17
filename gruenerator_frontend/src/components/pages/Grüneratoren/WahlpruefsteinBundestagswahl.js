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

const WahlpruefsteinBundestagswahl = ({ showHeaderFooter = true }) => {
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');
  const textSize = useDynamicTextSize(response, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/wahlpruefsteinbundestagswahl/frage');
  const { setGeneratedContent } = useContext(FormContext);

  const handleSubmit = useCallback(async () => {
    if (!question.trim()) {
      return;
    }

    try {
      const content = await submitForm({ question: question.trim() });
      if (content) {
        // Formatiere die Antwort mit HTML für bessere Lesbarkeit
        const formattedContent = content
          .replace(/Zitat:/g, '<strong>Zitat:</strong>')
          .replace(/Antwort:/g, '<strong>Bürgernahe Antwort:</strong>')
          .replace(/\n/g, '<br />');
        
        setResponse(formattedContent);
        setGeneratedContent(content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (error) {
      console.error('Error processing the question:', error);
    }
  }, [question, submitForm, resetSuccess, setGeneratedContent]);

  const handleGeneratedContentChange = useCallback((content) => {
    setResponse(content);
    setGeneratedContent(content);
  }, [setGeneratedContent]);

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title="Wahlprüfstein-Generator Bundestagswahl"
          subtitle="Stellen Sie eine Frage zum Bundestagswahlprogramm der Grünen"
          onSubmit={handleSubmit}
          loading={loading}
          success={success}
          error={error}
          generatedContent={response}
          textSize={textSize}
          onGeneratedContentChange={handleGeneratedContentChange}
        >
          <h3><label htmlFor="question">{FORM_LABELS.QUESTION || 'Ihre Frage'}</label></h3>
          <textarea
            id="question"
            name="question"
            placeholder={FORM_PLACEHOLDERS.QUESTION || 'Was möchten Sie zum Bundestagswahlprogramm der Grünen wissen?'}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            aria-required="true"
            style={{ height: '120px' }}
          />
          <p className="help-text">
            Die Antwort wird in zwei Teilen gegeben: Zuerst die relevanten Zitate aus dem Wahlprogramm, 
            dann eine bürgernahe Erklärung.
          </p>
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

WahlpruefsteinBundestagswahl.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default WahlpruefsteinBundestagswahl; 