import React, { useState, useCallback, useContext } from 'react';
import PropTypes from 'prop-types';
import '../../../assets/styles/common/variables.css';
import '../../../assets/styles/common/global.css';
import '../../../assets/styles/components/button.css';
import '../../../assets/styles/pages/baseform.css';
import {useDynamicTextSize } from '../../utils/commonFunctions';
import useApiSubmit from '../../hooks/useApiSubmit';
import BaseForm from '../../common/BaseForm';
import HelpDisplay from '../../common/HelpDisplay';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';
import { FormContext } from '../../utils/FormContext';
import ErrorBoundary from '../../ErrorBoundary';

const WahlpruefsteinBundestagswahl = ({ showHeaderFooter = true }) => {
  const [question, setQuestion] = useState('');
  const [selectedChapter, setSelectedChapter] = useState('');
  const [response, setResponse] = useState('');
  const textSize = useDynamicTextSize(response, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/wahlpruefsteinbundestagswahl/frage');
  const { setGeneratedContent } = useContext(FormContext);

  const getChapterDescription = (chapter) => {
    switch(chapter) {
      case "1":
        return "In diesem Kapitel geht es um die Verbindung von Wirtschaftswachstum und Klimaschutz. Hier finden Sie Antworten zu Themen wie nachhaltige Wirtschaft, Klimaschutz, Digitalisierung und zukunftsfähige Arbeitsplätze.";
      case "2":
        return "Dieses Kapitel behandelt soziale Gerechtigkeit und Teilhabe. Hier geht es um bezahlbares Wohnen, faire Löhne, Bildungschancen und ein gerechtes Gesundheitssystem.";
      case "3":
        return "In diesem Kapitel werden Fragen der inneren und äußeren Sicherheit behandelt. Themen sind unter anderem Demokratie, Bürgerrechte, Außenpolitik und europäische Zusammenarbeit.";
      default:
        return "";
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!question.trim() || !selectedChapter) {
      return;
    }

    try {
      const content = await submitForm({ 
        question: question.trim(),
        selectedChapter: selectedChapter
      });
      
      if (content) {
        const formattedContent = content
          .replace(/Zitat:/g, '<strong>Zitat:</strong>')
          .replace(/Antwort:/g, '<strong> Antwort:</strong>')
          .replace(/\n/g, '<br />');
        
        setResponse(formattedContent);
        setGeneratedContent(content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (error) {
      console.error('Error processing the question:', error);
    }
  }, [question, selectedChapter, submitForm, resetSuccess, setGeneratedContent]);

  const handleGeneratedContentChange = useCallback((content) => {
    setResponse(content);
    setGeneratedContent(content);
  }, [setGeneratedContent]);

  const helpContent = {
    content: "Die Antwort wird in zwei Teilen gegeben: Zuerst die relevanten Zitate aus dem gewählten Kapitel des vorläufigen Wahlprogramms, dann eine Erklärung.",
    tips: [
      "Die Zitate musst du anschließend UNBEDINGT überprüfen",
      "Beachte, dass sich das finale Wahlprogramm noch ändern kann"
    ]
  };

  const displayContent = response || (
    <HelpDisplay 
      content={helpContent.content}
      tips={helpContent.tips}
    />
  );

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title="BTW Programm-Kompass"
          subtitle="Stelle eine Frage zum vorläufigen Bundestagswahlprogramm"
          onSubmit={handleSubmit}
          loading={loading}
          success={success}
          error={error}
          generatedContent={displayContent}
          textSize={textSize}
          onGeneratedContentChange={handleGeneratedContentChange}
        >
          <h3><label htmlFor="chapter">{FORM_LABELS.SECTION || 'Wähle ein Kapitel'}</label></h3>
          <select
            id="chapter"
            name="chapter"
            value={selectedChapter}
            onChange={(e) => setSelectedChapter(e.target.value)}
            required
          >
            <option value="">-- Bitte wählen --</option>
            <option value="1">Kapitel 1: In die Zukunft wachsen – ökologisch und ökonomisch</option>
            <option value="2">Kapitel 2: Einfach dabei sein – fair und bezahlbar</option>
            <option value="3">Kapitel 3: Frieden in Freiheit sichern – innen und außen</option>
          </select>

          {selectedChapter && (
            <p className="help-text chapter-description white-text">
              {getChapterDescription(selectedChapter)}
            </p>
          )}

          <h3><label htmlFor="question">{FORM_LABELS.QUESTION || 'Deine Frage'}</label></h3>
          <textarea
            id="question"
            name="question"
            placeholder={FORM_PLACEHOLDERS.QUESTION || 'Was möchtest du zum vorläufigen Bundestagswahlprogramm wissen?'}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            required
            style={{ height: '120px' }}
          />
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

WahlpruefsteinBundestagswahl.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default WahlpruefsteinBundestagswahl; 