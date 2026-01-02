import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import BaseForm from '../../components/common/Form/BaseForm';
import useApiSubmit from '../../components/hooks/useApiSubmit';
import { useFormFields } from '../../components/common/Form/hooks';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import ErrorBoundary from '../../components/ErrorBoundary';
import { CitationModal, CitationSourcesDisplay } from '../../components/common/Citation';

// Ask Feature CSS - Loaded only when this feature is accessed
import '../../assets/styles/features/notebook/notebook-page.css';

const NotebookSearchPage = () => {
  const componentName = 'ask';
  const navigate = useNavigate();
  const { Textarea } = useFormFields();
  const { submitForm, loading, success, error } = useApiSubmit('/claude_gruenerator_ask');
  const { setGeneratedText, setGeneratedTextMetadata, setIsLoading: setStoreIsLoading, getGeneratedTextMetadata, getLinkConfig } = useGeneratedTextStore();

  const {
    control,
    handleSubmit,
    formState: { errors }
  } = useForm({
    defaultValues: {
      question: ''
    }
  });

  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));

  const onSubmitRHF = useCallback(async (rhfData) => {
    setStoreIsLoading(true);

    try {
      const formDataToSubmit = {
        question: rhfData.question.trim()
      };

      const result = await submitForm(formDataToSubmit);

      if (result && result.answer) {
        setGeneratedText(componentName, result.answer);
        setGeneratedTextMetadata(componentName, {
          sources: result.sources || [],
          citations: result.citations || []
        });
      }
    } catch (submitError) {
      console.error('[NotebookSearchPage] Error submitting question:', submitError);
    } finally {
      setStoreIsLoading(false);
    }
  }, [submitForm, setGeneratedText, setGeneratedTextMetadata, setStoreIsLoading, componentName]);

  const handleGeneratedContentChange = useCallback((content) => {
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  // Get sources and citations from store metadata
  const metadata = getGeneratedTextMetadata(componentName);
  const sources = metadata?.sources || [];
  const citations = metadata?.citations || [];
  const linkConfig = getLinkConfig(componentName);

  // Render sources using shared component
  const renderSourcesDisplay = () => {
    return (
      <CitationSourcesDisplay
        sources={sources}
        citations={citations}
        linkConfig={linkConfig}
        title="Quellen und Zitate"
      />
    );
  };

  const helpContent = {
    content: "Stellen Sie Fragen zu Ihren hochgeladenen Dokumenten. Das System durchsucht Ihre Dokumente und gibt Ihnen präzise Antworten basierend auf dem Inhalt.",
    tips: [
      "Formulieren Sie Ihre Frage klar und spezifisch",
      "Verwenden Sie Schlüsselwörter aus Ihren Dokumenten",
      "Stellen Sie eine Frage pro Anfrage für beste Ergebnisse",
      "Die Antwort basiert ausschließlich auf Ihren hochgeladenen Dokumenten"
    ]
  };

  return (
    <ErrorBoundary>
      <div className="container with-header">
        <CitationModal />

        <BaseForm
          title="Dokumente durchsuchen"
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={loading}
          success={success}
          error={error}
          formErrors={errors}
          generatedContent={storeGeneratedText}
          onGeneratedContentChange={handleGeneratedContentChange}
          helpContent={helpContent}
          submitButtonProps={{
            defaultText: loading ? "Suche..." : "Frage stellen",
            showStatus: false
          }}
          componentName={componentName}
          enableKnowledgeSelector={false}
          useMarkdown={true}
          displayActions={renderSourcesDisplay()}
        >
          <Textarea
            name="question"
            control={control}
            label="Ihre Frage zu den Dokumenten"
            placeholder="Stellen Sie eine Frage zu Ihren hochgeladenen Dokumenten..."
            rules={{
              required: 'Bitte stellen Sie eine Frage',
              minLength: { value: 3, message: 'Die Frage muss mindestens 3 Zeichen lang sein' }
            }}
            minRows={3}
            maxRows={8}
            className="form-textarea-large"
          />
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

export default NotebookSearchPage;
