import React, { useState, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { HiCode, HiDownload, HiCheck } from 'react-icons/hi';
import BaseForm from '../../components/common/Form/BaseForm/BaseForm';
import { FormInput, FormTextarea } from '../../components/common/Form/Input';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../stores/core/generatorSelectionStore';
import { useAuthStore } from '../../stores/authStore';
import useApiSubmit from '../../components/hooks/useApiSubmit';
import ErrorBoundary from '../../components/ErrorBoundary';
import BetaFeatureWrapper from '../../components/common/BetaFeatureWrapper';
import './website.css';

const WebsiteGeneratorContent = ({ showHeaderFooter = true }) => {
  const componentName = 'website-generator';
  const { setGeneratedText } = useGeneratedTextStore();
  const user = useAuthStore(state => state.user);

  const [copySuccess, setCopySuccess] = useState(false);

  const { loading, success, error, submitForm, resetSuccess } = useApiSubmit('/claude_website');

  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));
  const { getFeatureState } = useGeneratorSelectionStore();

  const {
    control,
    handleSubmit,
    formState: { errors }
  } = useForm({
    defaultValues: {
      description: '',
      email: user?.email || ''
    }
  });

  const onSubmitRHF = useCallback(async (formData) => {
    if (!formData.description) {
      return;
    }

    try {
      const features = getFeatureState();

      const response = await submitForm({
        description: formData.description,
        email: formData.email || null,
        usePrivacyMode: features.usePrivacyMode,
        useProMode: features.useProMode
      });

      if (response?.json) {
        const jsonString = JSON.stringify(response.json, null, 2);
        setGeneratedText(componentName, jsonString);
      }

      setTimeout(resetSuccess, 3000);
    } catch (err) {
      console.error('[WebsiteGenerator] Error generating content:', err);
    }
  }, [submitForm, setGeneratedText, resetSuccess, getFeatureState]);

  const handleCopyJson = useCallback(() => {
    if (storeGeneratedText) {
      navigator.clipboard.writeText(storeGeneratedText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, [storeGeneratedText]);

  const handleDownloadJson = useCallback(() => {
    if (storeGeneratedText) {
      const blob = new Blob([storeGeneratedText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'landing-page-content.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [storeGeneratedText]);

  const helpContent = {
    content: "Erstelle JSON-Inhalte für eine WordPress-Landingpage. Das generierte JSON kann direkt in das WordPress-Plugin eingefügt werden.",
    tips: [
      "Nenne deinen Namen, Rolle und politische Schwerpunkte",
      "Je detaillierter die Beschreibung, desto besser das Ergebnis",
      "Das JSON folgt einem festen Schema für das WordPress-Plugin"
    ]
  };

  const customExportOptions = useMemo(() => [
    {
      id: 'copy-json',
      label: copySuccess ? 'Kopiert!' : 'JSON kopieren',
      subtitle: 'In Zwischenablage kopieren',
      icon: copySuccess ? <HiCheck size={16} /> : <HiCode size={16} />,
      onClick: handleCopyJson,
      disabled: !storeGeneratedText
    },
    {
      id: 'download-json',
      label: 'JSON herunterladen',
      subtitle: 'Als .json Datei speichern',
      icon: <HiDownload size={16} />,
      onClick: handleDownloadJson,
      disabled: !storeGeneratedText
    }
  ], [copySuccess, handleCopyJson, handleDownloadJson, storeGeneratedText]);

  const renderFormInputs = () => (
    <>
      <FormTextarea
        name="description"
        control={control}
        label="Beschreibung deiner Person und politischen Arbeit"
        placeholder="Ich bin Max Mustermann, 42 Jahre alt und kandidiere für den Stadtrat in München. Seit 15 Jahren engagiere ich mich für Klimaschutz und nachhaltige Mobilität. Als Umweltingenieur bringe ich Fachwissen mit. Meine Schwerpunkte sind: Ausbau des Radwegenetzes, mehr Grünflächen in der Stadt, und bezahlbarer Wohnraum für alle..."
        minRows={6}
        maxRows={14}
        className="form-textarea-large"
        rules={{
          required: 'Beschreibung ist erforderlich'
        }}
        error={errors.description}
      />

      <FormInput
        name="email"
        control={control}
        label="Kontakt E-Mail (optional)"
        placeholder="kontakt@beispiel.de"
        type="email"
      />
    </>
  );

  const customRenderer = useCallback(({ content }) => {
    let jsonData = null;
    try {
      jsonData = typeof content === 'string' ? JSON.parse(content) : content;
    } catch {
      jsonData = null;
    }

    if (!jsonData) {
      return (
        <div className="website-generator-empty">
          <p>Hier erscheint das generierte JSON für deine Landing Page.</p>
        </div>
      );
    }

    return (
      <div className="website-generator-display">
        <div className="website-generator-content">
          <pre className="website-json-output">
            <code>{JSON.stringify(jsonData, null, 2)}</code>
          </pre>
        </div>
      </div>
    );
  }, []);

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title="Website Grünerator"
        onSubmit={() => handleSubmit(onSubmitRHF)()}
        loading={loading}
        success={success}
        error={error}
        generatedContent={storeGeneratedText}
        helpContent={helpContent}
        componentName={componentName}
        submitButtonText="JSON generieren"
        isSubmitDisabled={false}
        useFeatureIcons={true}
        usePrivacyModeToggle={true}
        useProModeToggle={true}
        customRenderer={customRenderer}
        customExportOptions={customExportOptions}
        hideDefaultExportOptions={true}
      >
        {renderFormInputs()}
      </BaseForm>
    </div>
  );
};

const WebsiteGenerator = (props) => {
  return (
    <ErrorBoundary>
      <BetaFeatureWrapper featureKey="website" fallbackPath="/profile?tab=labor">
        <WebsiteGeneratorContent {...props} />
      </BetaFeatureWrapper>
    </ErrorBoundary>
  );
};

export default WebsiteGenerator;
