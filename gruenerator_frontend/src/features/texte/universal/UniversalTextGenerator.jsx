import React, { useState, useCallback, useContext, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
// import { useDynamicTextSize } from '../../../components/utils/commonFunctions';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import BaseForm from '../../../components/common/BaseForm';
import { FormContext } from '../../../components/utils/FormContext';
import ErrorBoundary from '../../../components/ErrorBoundary';
import TextTypeSelector, { TEXT_TYPES, TEXT_TYPE_TITLES } from './components/TextTypeSelector';
import RedeForm from './RedeForm';
import WahlprogrammForm from './WahlprogrammForm';
import UniversalForm from './UniversalForm';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';

const API_ENDPOINTS = {
  [TEXT_TYPES.REDE]: '/claude_rede',
  [TEXT_TYPES.WAHLPROGRAMM]: '/claude_wahlprogramm',
  [TEXT_TYPES.UNIVERSAL]: '/claude_universal'
};

const UniversalTextGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'universal-text';
  const [selectedType, setSelectedType] = useState(TEXT_TYPES.UNIVERSAL);
  const [generatedContent, setGeneratedContent] = useState('');
  const formRef = useRef();
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();
  
  // const textSize = useDynamicTextSize(generatedContent, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit(API_ENDPOINTS[selectedType]);
  const { /* setGeneratedContent: setContextGeneratedContent */ } = useContext(FormContext);

  useEffect(() => {
    setStoreIsLoading(loading);
  }, [loading, setStoreIsLoading]);

  const handleSubmit = useCallback(async () => {
    if (!formRef.current?.getFormData) return;
    
    const formData = formRef.current.getFormData();
    if (!formData) return;

    try {
      const content = await submitForm(formData);
      if (content) {
        setGeneratedContent(content);
        setGeneratedText(componentName, content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  }, [submitForm, resetSuccess, setGeneratedText, selectedType, componentName]);

  const handleGeneratedContentChange = useCallback((content) => {
    setGeneratedContent(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  const helpContent = {
    content: "Der Universal Text Grünerator erstellt verschiedene Textarten - von Reden über Wahlprogramme bis hin zu allgemeinen Texten.",
    tips: [
      "Wähle zunächst den passenden Texttyp aus",
      "Reden: Perfekt für Veranstaltungen und öffentliche Auftritte",
      "Wahlprogramme: Strukturierte politische Inhalte",
      "Universal: Für alle anderen Textarten geeignet",
      "Gib spezifische Details für bessere Ergebnisse an"
    ]
  };

  const renderForm = () => {
    switch (selectedType) {
      case TEXT_TYPES.REDE:
        return <RedeForm ref={formRef} />;
      case TEXT_TYPES.WAHLPROGRAMM:
        return <WahlprogrammForm ref={formRef} />;
      case TEXT_TYPES.UNIVERSAL:
        return <UniversalForm ref={formRef} />;
      default:
        return null;
    }
  };

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title={TEXT_TYPE_TITLES[selectedType]}
          loading={loading}
          success={success}
          error={error}
          generatedContent={generatedContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          onSubmit={handleSubmit}
          helpContent={helpContent}
          componentName={componentName}
        >
          <TextTypeSelector 
            selectedType={selectedType}
            onTypeChange={setSelectedType}
          />
          {renderForm()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

UniversalTextGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default UniversalTextGenerator; 