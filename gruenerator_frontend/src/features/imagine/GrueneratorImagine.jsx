import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';
import CreatableSelect from 'react-select/creatable';
import BaseForm from '../../components/common/BaseForm';
import TypeSelector from '../../components/common/TypeSelector';
import { useFormFields } from '../../components/common/Form/hooks';
import FileUpload from '../../components/common/FileUpload';
import FormFieldWrapper from '../../components/common/Form/Input/FormFieldWrapper';
import AllyMakerForm from './AllyMakerForm';
import ErrorBoundary from '../../components/ErrorBoundary';
import apiClient from '../../components/utils/apiClient';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import useImageGenerationLimit from '../../hooks/useImageGenerationLimit';

// Imagine types
export const IMAGINE_TYPES = {
  GREEN_EDIT: 'green-edit',
  ALLY_MAKER: 'ally-maker'
};

export const IMAGINE_TYPE_LABELS = {
  [IMAGINE_TYPES.GREEN_EDIT]: 'Grüne Straßengestaltung',
  [IMAGINE_TYPES.ALLY_MAKER]: 'Ally-Maker (Regenbogen-Tattoo)'
};

export const IMAGINE_TYPE_TITLES = {
  [IMAGINE_TYPES.GREEN_EDIT]: 'Grünerator Imagine',
  [IMAGINE_TYPES.ALLY_MAKER]: 'Grünerator Imagine'
};

const GrueneratorImagine = ({ showHeaderFooter = true }) => {
  const componentName = 'imagine';
  const { setGeneratedText, getGeneratedText } = useGeneratedTextStore();
  const { data: imageLimitData, isLoading: imageLimitLoading, refetch: refetchImageLimit } = useImageGenerationLimit();
  
  const [selectedType, setSelectedType] = useState(IMAGINE_TYPES.GREEN_EDIT);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [selectedInfrastructure, setSelectedInfrastructure] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const {
    control,
    handleSubmit,
    formState: { errors }
  } = useForm({
    defaultValues: {
      instruction: ''
    }
  });

  const infrastructureOptions = [
    { value: 'baeume', label: 'Bäume & Straßengrün' },
    { value: 'pflanzen', label: 'Bepflanzung & bienenfreundliche Blumen' },
    { value: 'fahrradwege', label: 'Geschützte Fahrradwege' },
    { value: 'sitzgelegenheiten', label: 'Sitzbänke im Schatten' },
    { value: 'fussgaenger', label: 'Breitere Gehwege' },
    { value: 'nachhaltige_materialien', label: 'Nachhaltige Materialien' },
    { value: 'verkehrsberuhigung', label: 'Verkehrsberuhigung' },
    { value: 'barrierefreiheit', label: 'Barrierefreie Gestaltung' }
  ];

  const handleImageChange = useCallback((file) => {
    setUploadedImage(file);
  }, []);

  const handleInfrastructureChange = useCallback((newValues) => {
    const selectedValues = newValues || [];
    setSelectedInfrastructure(selectedValues);
  }, []);

  const handleTypeChange = useCallback((newType) => {
    setSelectedType(newType);
    // Reset form state when changing types
    setUploadedImage(null);
    setSelectedInfrastructure([]);
    setError('');
    setResult(null);
  }, []);

  const onSubmitRHF = useCallback(async (formData) => {
    // Check image generation limit before processing
    if (imageLimitData && !imageLimitData.canGenerate) {
      const timeUntilReset = imageLimitData.timeUntilReset || 'morgen';
      setError(`Tageslimit erreicht (${imageLimitData.count}/${imageLimitData.limit}). Nächste Nutzung ${timeUntilReset} möglich.`);
      return;
    }

    if (selectedType === IMAGINE_TYPES.GREEN_EDIT) {
      if (!uploadedImage) {
        setError('Bitte ein Bild auswählen.');
        return;
      }
    }

    setLoading(true);
    setSuccess(false);
    setError('');

    try {
      let response;
      
      if (selectedType === IMAGINE_TYPES.GREEN_EDIT) {
        // Build instruction from selected options
        const instruction = selectedInfrastructure.length > 0 
          ? selectedInfrastructure.map(opt => opt.label || opt.value).join(', ')
          : '';

        const fd = new FormData();
        fd.append('image', uploadedImage);
        fd.append('text', instruction);

        response = await apiClient.post('/flux/green-edit/prompt', fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else if (selectedType === IMAGINE_TYPES.ALLY_MAKER) {
        // For ally-maker, get form data from form ref
        if (!allyMakerFormRef.current?.isValid()) {
          setError('Bitte ein Bild auswählen.');
          return;
        }
        
        const allyData = allyMakerFormRef.current.getFormData();
        
        const fd = new FormData();
        fd.append('image', allyData.image);
        fd.append('text', allyData.placement || '');
        fd.append('type', 'ally-maker');

        response = await apiClient.post('/flux/green-edit/prompt', fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      const data = response?.data || {};
      setResult(data);
      
      if (selectedType === IMAGINE_TYPES.GREEN_EDIT && data?.image?.base64) {
        // Format the response for Green Edit
        const sharepicData = {
          image: data.image.base64,
          text: selectedInfrastructure.length > 0 
            ? selectedInfrastructure.map(opt => opt.label || opt.value).join(', ')
            : 'Grüne Stadtgestaltung',
          type: 'green-edit'
        };
        
        const mixedContent = {
          sharepic: sharepicData,
          showEditButton: false,
          sharepicTitle: "Grüneriertes Bild",
          sharepicDownloadText: "Herunterladen",
          sharepicDownloadFilename: "gruenerator_imagine.png"
        };
        
        setGeneratedText(componentName, mixedContent, {});
      } else if (selectedType === IMAGINE_TYPES.ALLY_MAKER && data?.image?.base64) {
        // For ally-maker, format as image content
        const sharepicData = {
          image: data.image.base64,
          text: 'Ally-Maker: Regenbogen-Tattoo',
          type: 'ally-maker'
        };
        
        const mixedContent = {
          sharepic: sharepicData,
          showEditButton: false,
          sharepicTitle: "Ally-Maker Bild",
          sharepicDownloadText: "Herunterladen",
          sharepicDownloadFilename: "gruenerator_ally_maker.png"
        };
        
        setGeneratedText(componentName, mixedContent, {});
      } else {
        setGeneratedText(componentName, '', {});
      }
      setSuccess(true);
      // Refetch image limit status after successful generation
      refetchImageLimit();
    } catch (e) {
      console.error('Image generation error:', e);
      
      // Handle specific rate limit errors
      if (e.response?.status === 429) {
        const errorData = e.response?.data;
        if (errorData?.message) {
          setError(errorData.message);
        } else if (errorData?.data?.timeUntilReset) {
          setError(`Tageslimit erreicht. Nächste Nutzung in ${errorData.data.timeUntilReset} möglich.`);
        } else {
          setError('Tageslimit für Bilderzeugung erreicht. Versuche es morgen erneut.');
        }
        // Refetch to update UI with current limit status
        refetchImageLimit();
      } else {
        setError(e?.message || 'Fehler beim Verarbeiten der Anfrage');
      }
    } finally {
      setLoading(false);
      setTimeout(() => setSuccess(false), 3000);
    }
  }, [uploadedImage, selectedInfrastructure, selectedType, setGeneratedText, refetchImageLimit]);

  const handleGeneratedContentChange = useCallback((content) => {
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  const getHelpContent = () => {
    if (selectedType === IMAGINE_TYPES.GREEN_EDIT) {
      return {
        content: "Verwandle Straßenfotos in grünere, lebenswertere Orte mit KI-gestützter Bildbearbeitung.",
        tips: [
          "Lade ein klares Straßenfoto hoch (Gehwege, Plätze, Straßenzüge)",
          "Wähle aus vorgefertigten grünen Verbesserungen oder gib eigene Ideen ein",
          "Architektur und Gebäude bleiben unverändert erhalten",
          "Bäume, Radwege, Sitzbänke und Bepflanzung werden realistisch hinzugefügt",
          "Perfekt für Bürgerbeteiligung, Stadtplanung oder Visionen",
          "Das Ergebnis zeigt, wie lebenswert deine Straße werden könnte",
          "⚠️ Bilderzeugung ist CO₂-intensiv - bitte sparsam verwenden!"
        ]
      };
    } else if (selectedType === IMAGINE_TYPES.ALLY_MAKER) {
      return {
        content: "Der Ally-Maker fügt ein kleines, dezentes Regenbogen-Flaggen-Tattoo zu Fotos von Personen hinzu, um Solidarität mit der LGBTQ+ Community zu zeigen.",
        tips: [
          "Lade ein klares Foto einer Person hoch",
          "Die Person bleibt völlig unverändert - nur das Tattoo wird hinzugefügt", 
          "Das Tattoo wird realistisch und natürlich aussehen",
          "Wähle optional eine spezifische Stelle für das Tattoo aus",
          "Das Tattoo verdeckt niemals das Gesicht",
          "Perfekt für Profile, Social Media oder Solidaritätsbekundungen",
          "⚠️ Bilderzeugung ist CO₂-intensiv - bitte sparsam verwenden!"
        ]
      };
    }
    return { content: '' };
  };

  const getSubmitButtonText = () => {
    if (selectedType === IMAGINE_TYPES.GREEN_EDIT) {
      return "Straße verwandeln";
    } else if (selectedType === IMAGINE_TYPES.ALLY_MAKER) {
      return "Ally-Botschaft erstellen";
    }
    return "Generieren";
  };

  const getSubmitDisabled = () => {
    // Check image limit first
    if (imageLimitData && !imageLimitData.canGenerate) {
      return true;
    }
    
    if (selectedType === IMAGINE_TYPES.GREEN_EDIT) {
      return !uploadedImage;
    } else if (selectedType === IMAGINE_TYPES.ALLY_MAKER) {
      return !allyMakerFormRef.current?.isValid();
    }
    return false;
  };

  const renderTypeSelector = () => (
    <TypeSelector
      types={IMAGINE_TYPES}
      typeLabels={IMAGINE_TYPE_LABELS}
      selectedType={selectedType}
      onTypeChange={handleTypeChange}
      label="Imagine-Modus"
      name="imagineType"
      required={true}
    />
  );

  const renderGreenEditForm = () => (
    <>
      <FileUpload
        handleChange={handleImageChange}
        allowedTypes={['.jpg', '.jpeg', '.png', '.webp']}
        file={uploadedImage}
        loading={loading}
        label="Straßenfoto hochladen"
      />

      <FormFieldWrapper
        label="Grüne Verbesserungen auswählen (optional)"
        helpText="Wähle aus den Vorschlägen oder gib eigene Ideen ein"
      >
        <CreatableSelect
          classNamePrefix="react-select"
          isMulti={true}
          options={infrastructureOptions}
          value={selectedInfrastructure}
          onChange={handleInfrastructureChange}
          placeholder="z.B. Bäume, Fahrradwege oder eigene Ideen eingeben..."
          noOptionsMessage={() => "Keine passende Option gefunden"}
          formatCreateLabel={(inputValue) => `Eigene Idee: "${inputValue}"`}
          createOptionPosition="first"
          isClearable={true}
          isSearchable={true}
          closeMenuOnSelect={false}
          hideSelectedOptions={false}
          isDisabled={loading}
          menuPortalTarget={document.body}
          menuPosition="fixed"
          styles={{
            container: (provided) => ({
              ...provided,
              fontSize: 'var(--form-element-font-size)'
            }),
            control: (provided) => ({
              ...provided,
              minHeight: 'var(--form-element-min-height)',
            }),
            menuPortal: (base) => ({ 
              ...base, 
              zIndex: 9999 
            })
          }}
        />
      </FormFieldWrapper>
    </>
  );

  const allyMakerFormRef = React.useRef();

  const renderAllyMakerForm = () => (
    <AllyMakerForm ref={allyMakerFormRef} loading={loading} />
  );

  const renderFormInputs = () => {
    if (selectedType === IMAGINE_TYPES.GREEN_EDIT) {
      return renderGreenEditForm();
    } else if (selectedType === IMAGINE_TYPES.ALLY_MAKER) {
      return renderAllyMakerForm();
    }
    return null;
  };


  const generatedContent = getGeneratedText(componentName) || '';

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title={<span className="gradient-title">{IMAGINE_TYPE_TITLES[selectedType]}</span>}
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={loading}
          success={success}
          error={error}
          generatedContent={generatedContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          helpContent={getHelpContent()}
          componentName={componentName}
          submitButtonText={getSubmitButtonText()}
          isSubmitDisabled={getSubmitDisabled()}
          firstExtrasChildren={renderTypeSelector()}
          submitButtonProps={{
            imageLimitInfo: imageLimitData ? {
              count: imageLimitData.count,
              limit: imageLimitData.limit
            } : null
          }}
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

GrueneratorImagine.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default withAuthRequired(GrueneratorImagine, {
  title: 'Gruenerator Imagine',
  loginRequiredVariant: 'fullpage'
});