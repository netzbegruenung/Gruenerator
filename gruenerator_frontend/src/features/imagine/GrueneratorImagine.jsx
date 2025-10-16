import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import CreatableSelect from 'react-select/creatable';
import BaseForm from '../../components/common/BaseForm';
import PlatformSelector from '../../components/common/PlatformSelector';
import {
  HiPhotograph,
  HiColorSwatch,
  HiSparkles
} from 'react-icons/hi';
import { useFormFields } from '../../components/common/Form/hooks';
import FileUpload from '../../components/common/FileUpload';
import FormFieldWrapper from '../../components/common/Form/Input/FormFieldWrapper';
import AllyMakerForm from './AllyMakerForm';
import ErrorBoundary from '../../components/ErrorBoundary';
import TextAreaInput from '../../components/common/Form/Input/TextAreaInput';
import FeatureToggle from '../../components/common/FeatureToggle';
import { PiCrosshair } from 'react-icons/pi';
import useApiSubmit from '../../components/hooks/useApiSubmit';
import apiClient from '../../components/utils/apiClient';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import useImageGenerationLimit from '../../hooks/useImageGenerationLimit';
import useBaseForm from '../../components/common/Form/hooks/useBaseForm';
import { useOptimizedAuth } from '../../hooks/useAuth';

// Imagine Feature CSS - Loaded only when this feature is accessed
import '../../assets/styles/features/imagine/image-limit-indicator.css';

// Imagine types
export const IMAGINE_TYPES = {
  GREEN_EDIT: 'green-edit',
  ALLY_MAKER: 'ally-maker',
  UNIVERSAL: 'universal'
};

export const IMAGINE_TYPE_LABELS = {
  [IMAGINE_TYPES.GREEN_EDIT]: 'Grüne Straßengestaltung',
  [IMAGINE_TYPES.ALLY_MAKER]: 'Ally-Maker',
  [IMAGINE_TYPES.UNIVERSAL]: 'Universal'
};

const IMAGINE_TYPE_ICONS = {
  [IMAGINE_TYPES.GREEN_EDIT]: HiPhotograph,
  [IMAGINE_TYPES.ALLY_MAKER]: HiColorSwatch,
  [IMAGINE_TYPES.UNIVERSAL]: HiSparkles
};

const IMAGINE_TYPE_DESCRIPTIONS = {
  [IMAGINE_TYPES.GREEN_EDIT]: 'Verwandle Straßen und öffentliche Räume grün',
  [IMAGINE_TYPES.ALLY_MAKER]: 'Füge Regenbogen-Tattoos zu Bildern hinzu',
  [IMAGINE_TYPES.UNIVERSAL]: 'Freie Bildbearbeitung nach deinen Wünschen'
};

export const IMAGINE_TYPE_TITLES = {
  [IMAGINE_TYPES.GREEN_EDIT]: 'Grünerator Imagine',
  [IMAGINE_TYPES.ALLY_MAKER]: 'Grünerator Imagine',
  [IMAGINE_TYPES.UNIVERSAL]: 'Grünerator Imagine'
};

const GrueneratorImagine = ({ showHeaderFooter = true }) => {
  const componentName = 'imagine';
  const { setGeneratedText, getGeneratedText } = useGeneratedTextStore();
  const { data: imageLimitData, isLoading: imageLimitLoading, refetch: refetchImageLimit } = useImageGenerationLimit();
  const { submitForm, loading: apiLoading } = useApiSubmit('/flux/green-edit/prompt');

  const [selectedType, setSelectedType] = useState(IMAGINE_TYPES.GREEN_EDIT);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [selectedInfrastructure, setSelectedInfrastructure] = useState([]);
  const [result, setResult] = useState(null);
  const [isPrecisionMode, setIsPrecisionMode] = useState(false);
  const [precisionInstruction, setPrecisionInstruction] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useOptimizedAuth();

  // Separate refs for each form type
  const formRefs = useRef({
    [IMAGINE_TYPES.GREEN_EDIT]: useRef(),
    [IMAGINE_TYPES.ALLY_MAKER]: useRef(),
    [IMAGINE_TYPES.UNIVERSAL]: useRef()
  });
  const allyMakerFormRef = formRefs.current[IMAGINE_TYPES.ALLY_MAKER];
  const currentFormRef = formRefs.current[selectedType];

  const infrastructureOptions = [
    { value: 'baeume', label: 'Bäume & Straßengrün' },
    { value: 'pflanzen', label: 'Bepflanzung & bienenfreundliche Blumen' },
    { value: 'fahrradwege', label: 'Geschützte Fahrradwege' },
    { value: 'sitzgelegenheiten', label: 'Sitzbänke im Schatten' },
    { value: 'fussgaenger', label: 'Breitere Gehwege' },
    { value: 'strassenbahn', label: 'Straßenbahn' },
    { value: 'bushaltestelle', label: 'Bushaltestelle' }
  ];

  const handleImageChange = useCallback((file) => {
    setUploadedImage(file);
  }, []);

  const handleInfrastructureChange = useCallback((newValues) => {
    const selectedValues = newValues || [];
    setSelectedInfrastructure(selectedValues);
  }, []);

  // Memoize helpContent to prevent unnecessary re-renders
  const helpContent = useMemo(() => {
    const baseTips = {
      [IMAGINE_TYPES.GREEN_EDIT]: {
        standard: [
          "Lade ein klares Straßenfoto hoch (Gehwege, Plätze, Straßenzüge)",
          "Wähle aus vorgefertigten grünen Verbesserungen oder gib eigene Ideen ein",
          "Architektur und Gebäude bleiben unverändert erhalten",
          "Bäume, Radwege, Sitzbänke und Bepflanzung werden realistisch hinzugefügt",
          "Perfekt für Bürgerbeteiligung, Stadtplanung oder Visionen",
          "⚠️ Bilderzeugung ist CO₂-intensiv - bitte sparsam verwenden!"
        ],
        precision: [
          <span key="detail"><strong>Schreibe detaillierte Anweisungen</strong> für präzise Bildbearbeitung</span>,
          <span key="concrete">Verwende <strong>konkrete Beschreibungen</strong>: <code>'Füge drei große Linden auf der linken Straßenseite hinzu'</code></span>,
          <span key="position">Gib <strong>klare Positionsangaben</strong> an: <code>'links/rechts'</code>, <code>'im Vordergrund'</code>, <code>'neben dem Eingang'</code></span>,
          <span key="multiple">Beschreibe <strong>mehrere Änderungen</strong> in einem Text: <code>'Ersetze Parkplätze durch Park mit Bänken'</code></span>,
          <span key="preserve">Architektur und Gebäude bleiben automatisch erhalten</span>,
          <span key="iterate">Starte mit <em>einfachen Anweisungen</em> und erweitere sie schrittweise</span>,
          <span key="co2" style={{color: 'var(--warning-color, #e67e22)'}}>Bilderzeugung ist CO₂-intensiv - bitte sparsam verwenden!</span>
        ]
      },
      [IMAGINE_TYPES.ALLY_MAKER]: {
        standard: [
          "Lade ein klares Foto einer Person hoch",
          "Die Person bleibt völlig unverändert - nur das Tattoo wird hinzugefügt",
          "Das Tattoo wird realistisch und natürlich aussehen",
          "Wähle optional eine spezifische Stelle für das Tattoo aus",
          "Das Tattoo verdeckt niemals das Gesicht",
          "Perfekt für Profile, Social Media oder Solidaritätsbekundungen",
          "⚠️ Bilderzeugung ist CO₂-intensiv - bitte sparsam verwenden!"
        ],
        precision: [
          <span key="exact"><strong>Beschreibe exakt</strong>, wo und wie das Tattoo platziert werden soll</span>,
          <span key="precise">Verwende <strong>präzise Positionsangaben</strong>: <code>'Linke Wange, 2cm unter dem Auge'</code></span>,
          <span key="size">Gib <strong>Größe an</strong>: <code>'etwa 1cm Durchmesser'</code>, <code>'fingernagel-groß'</code>, <code>'dezent und klein'</code></span>,
          <span key="style">Füge <strong>Stildetails</strong> hinzu: <code>'mit feinen Linien'</code>, <code>'in Aquarell-Stil'</code>, <code>'sanfte Farben'</code></span>,
          <span key="example"><strong>Beispiel</strong>: <code>'Winziges Regenbogen-Herz am rechten Handgelenk, natürlich aussehend'</code></span>,
          <span key="unchanged">Person bleibt <strong>komplett unverändert</strong>: Gesicht, Haare, Ausdruck, Pose</span>,
          <span key="co2" style={{color: 'var(--warning-color, #e67e22)'}}>Bilderzeugung ist CO₂-intensiv - bitte sparsam verwenden!</span>
        ]
      },
      [IMAGINE_TYPES.UNIVERSAL]: {
        precision: [
          <span key="freedom"><strong>Freie Bildbearbeitung</strong> - beschreibe beliebige Änderungen</span>,
          <span key="detail">Verwende <strong>detaillierte Beschreibungen</strong> für beste Ergebnisse</span>,
          <span key="examples"><strong>Beispiele</strong>: Objekte hinzufügen/entfernen, Farben ändern, Himmel austauschen, Personen/Tiere einfügen</span>,
          <span key="position">Gib <strong>klare Positionsangaben</strong> an: links/rechts, Vordergrund/Hintergrund</span>,
          <span key="iterate">Starte mit einfachen Änderungen und erweitere schrittweise</span>,
          <span key="co2" style={{color: 'var(--warning-color, #e67e22)'}}>⚠️ Bilderzeugung ist CO₂-intensiv - bitte sparsam verwenden!</span>
        ]
      }
    };

    if (selectedType === IMAGINE_TYPES.GREEN_EDIT) {
      return {
        content: "Verwandle Straßenfotos in grünere, lebenswertere Orte mit KI-gestützter Bildbearbeitung.",
        title: IMAGINE_TYPE_TITLES[selectedType],
        tips: baseTips[selectedType][isPrecisionMode ? 'precision' : 'standard']
      };
    } else if (selectedType === IMAGINE_TYPES.ALLY_MAKER) {
      return {
        content: "Der Ally-Maker fügt ein kleines, dezentes Regenbogen-Flaggen-Tattoo zu Fotos von Personen hinzu, um Solidarität mit der LGBTQ+ Community zu zeigen.",
        title: IMAGINE_TYPE_TITLES[selectedType],
        tips: baseTips[selectedType][isPrecisionMode ? 'precision' : 'standard']
      };
    } else if (selectedType === IMAGINE_TYPES.UNIVERSAL) {
      return {
        content: "Freie KI-gestützte Bildbearbeitung - beschreibe beliebige Änderungen und transformiere Bilder nach deinen Wünschen.",
        title: IMAGINE_TYPE_TITLES[selectedType],
        tips: baseTips[selectedType].precision
      };
    }
    return { content: '', title: '' };
  }, [selectedType, isPrecisionMode]);

  // Initialize useBaseForm with current type
  const form = useBaseForm({
    defaultValues: {
      instruction: ''
    },
    generatorType: `imagine-${selectedType}`,
    componentName: componentName,
    endpoint: '/flux/green-edit/prompt',
    disableKnowledgeSystem: true,
    features: [], // No webSearch or privacyMode for image generation
    tabIndexKey: 'IMAGINE',
    helpContent: helpContent
  });

  // Use local loading state for manual management
  const isLoading = isSubmitting;

  const updateSharepicInStore = useCallback((updatedSharepic) => {
    if (!updatedSharepic) return;

    const store = useGeneratedTextStore.getState();
    const currentContent = store.generatedTexts?.[componentName];
    const baseContent = (currentContent && typeof currentContent === 'object') ? currentContent : {};

    const nextContent = {
      ...baseContent,
      sharepic: updatedSharepic,
      enableKiLabel: true
    };

    nextContent.onSharepicUpdate = updateSharepicInStore;

    store.setGeneratedText(componentName, nextContent);
  }, [componentName]);

  const handleTypeChange = useCallback((newType) => {
    setSelectedType(newType);
    // Reset form state when changing types
    setSelectedInfrastructure([]);
    setResult(null);
    setPrecisionInstruction('');
    // Force precision mode for UNIVERSAL, otherwise reset to false
    setIsPrecisionMode(newType === IMAGINE_TYPES.UNIVERSAL);
  }, []);

  // Reset form when type changes
  useEffect(() => {
    if (currentFormRef.current?.resetForm) {
      currentFormRef.current.resetForm();
    }
  }, [selectedType, currentFormRef]);

  const customSubmit = useCallback(async (formData) => {
    setIsSubmitting(true);

    try {
      // Check image generation limit before processing
      if (imageLimitData && !imageLimitData.canGenerate) {
        const timeUntilReset = imageLimitData.timeUntilReset || 'morgen';
        form.handleSubmitError(new Error(`Tageslimit erreicht (${imageLimitData.count}/${imageLimitData.limit}). Nächste Nutzung ${timeUntilReset} möglich.`));
        return;
      }

      if (selectedType === IMAGINE_TYPES.GREEN_EDIT) {
        if (!uploadedImage) {
          form.handleSubmitError(new Error('Bitte ein Bild auswählen.'));
          return;
        }
      } else if (selectedType === IMAGINE_TYPES.UNIVERSAL) {
        if (!uploadedImage) {
          form.handleSubmitError(new Error('Bitte ein Bild auswählen.'));
          return;
        }
        if (!precisionInstruction || precisionInstruction.trim().length < 15) {
          form.handleSubmitError(new Error('Bitte mindestens 15 Zeichen für die Anweisungen eingeben.'));
          return;
        }
      }
      let formDataToSubmit;

      if (selectedType === IMAGINE_TYPES.GREEN_EDIT) {
        // Build instruction from selected options or precision text
        const instruction = isPrecisionMode
          ? precisionInstruction
          : (selectedInfrastructure.length > 0
              ? selectedInfrastructure.map(opt => opt.label || opt.value).join(', ')
              : '');

        formDataToSubmit = new FormData();
        formDataToSubmit.append('image', uploadedImage);
        formDataToSubmit.append('text', instruction);
        formDataToSubmit.append('precision', isPrecisionMode.toString());
      } else if (selectedType === IMAGINE_TYPES.ALLY_MAKER) {
        // For ally-maker, get form data from form ref
        if (!allyMakerFormRef.current?.isValid()) {
          form.handleSubmitError(new Error('Bitte ein Bild auswählen.'));
          return;
        }

        const allyData = allyMakerFormRef.current.getFormData();

        formDataToSubmit = new FormData();
        formDataToSubmit.append('image', allyData.image);
        formDataToSubmit.append('text', allyData.placement || '');
        formDataToSubmit.append('type', 'ally-maker');
        formDataToSubmit.append('precision', isPrecisionMode.toString());
      } else if (selectedType === IMAGINE_TYPES.UNIVERSAL) {
        // For universal mode, always use precision mode
        formDataToSubmit = new FormData();
        formDataToSubmit.append('image', uploadedImage);
        formDataToSubmit.append('text', precisionInstruction);
        formDataToSubmit.append('type', 'universal');
        formDataToSubmit.append('precision', 'true');
      }

      const response = await apiClient.post('/flux/green-edit/prompt', formDataToSubmit, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const data = response?.data || {};
      setResult(data);

      if (selectedType === IMAGINE_TYPES.GREEN_EDIT && data?.image?.base64) {
        // Format the response for Green Edit
        const sharepicData = {
          image: data.image.base64,
          text: isPrecisionMode
            ? (precisionInstruction || 'Präzise Stadtgestaltung')
            : (selectedInfrastructure.length > 0
                ? selectedInfrastructure.map(opt => opt.label || opt.value).join(', ')
                : 'Grüne Stadtgestaltung'),
          type: 'green-edit'
        };

        const mixedContent = {
          sharepic: sharepicData,
          showEditButton: false,
          sharepicTitle: "Grüneriertes Bild",
          sharepicDownloadText: "Herunterladen",
          sharepicDownloadFilename: "gruenerator_imagine.png",
          enableKiLabel: true,
          onSharepicUpdate: updateSharepicInStore
        };

        form.generator.handleGeneratedContentChange(mixedContent);
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
          sharepicDownloadFilename: "gruenerator_ally_maker.png",
          enableKiLabel: true,
          onSharepicUpdate: updateSharepicInStore
        };

        form.generator.handleGeneratedContentChange(mixedContent);
      } else if (selectedType === IMAGINE_TYPES.UNIVERSAL && data?.image?.base64) {
        // For universal mode, format as generic image content
        const sharepicData = {
          image: data.image.base64,
          text: precisionInstruction.substring(0, 100) || 'Universal Bildbearbeitung',
          type: 'universal'
        };

        const mixedContent = {
          sharepic: sharepicData,
          showEditButton: false,
          sharepicTitle: "Bearbeitetes Bild",
          sharepicDownloadText: "Herunterladen",
          sharepicDownloadFilename: "gruenerator_universal.png",
          enableKiLabel: true,
          onSharepicUpdate: updateSharepicInStore
        };

        form.generator.handleGeneratedContentChange(mixedContent);
      } else {
        form.generator.handleGeneratedContentChange('');
      }
      // Refetch image limit status after successful generation
      refetchImageLimit();
    } catch (e) {
      console.error('Image generation error:', e);
      form.handleSubmitError(e);

      // Refetch image limit if rate limited
      if (e.response?.status === 429) {
        refetchImageLimit();
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [uploadedImage, selectedInfrastructure, selectedType, refetchImageLimit, form, isPrecisionMode, precisionInstruction, setIsSubmitting, updateSharepicInStore]);

  const handleGeneratedContentChange = useCallback((content) => {
    form.generator.handleGeneratedContentChange(content);
  }, [form.generator]);

  const getSubmitButtonText = () => {
    if (selectedType === IMAGINE_TYPES.GREEN_EDIT) {
      return "Straße verwandeln";
    } else if (selectedType === IMAGINE_TYPES.ALLY_MAKER) {
      return "Ally-Botschaft erstellen";
    } else if (selectedType === IMAGINE_TYPES.UNIVERSAL) {
      return "Bild bearbeiten";
    }
    return "Generieren";
  };

  const getSubmitDisabled = () => {
    // Always disable during loading to prevent multiple clicks
    if (isLoading) {
      return true;
    }

    // Check image limit
    if (imageLimitData && !imageLimitData.canGenerate) {
      return true;
    }

    if (selectedType === IMAGINE_TYPES.GREEN_EDIT) {
      if (!uploadedImage) return true;
      if (isPrecisionMode && (!precisionInstruction || precisionInstruction.trim().length < 10)) return true;
      return false;
    } else if (selectedType === IMAGINE_TYPES.ALLY_MAKER) {
      return !allyMakerFormRef.current?.isValid();
    } else if (selectedType === IMAGINE_TYPES.UNIVERSAL) {
      if (!uploadedImage) return true;
      if (!precisionInstruction || precisionInstruction.trim().length < 15) return true;
      return false;
    }
    return false;
  };

  const renderTypeSelector = () => {
    const imagineTypeOptions = Object.entries(IMAGINE_TYPE_LABELS).map(([value, label]) => ({
      value,
      label,
      icon: IMAGINE_TYPE_ICONS[value],
      subtitle: IMAGINE_TYPE_DESCRIPTIONS[value]
    }));

    return (
      <PlatformSelector
        name="imagineType"
        options={imagineTypeOptions}
        value={selectedType}
        onChange={handleTypeChange}
        label="Imagine-Modus"
        placeholder="Modus auswählen..."
        isMulti={false}
        control={null}
        enableIcons={true}
        enableSubtitles={true}
        iconType="react-icon"
        isSearchable={false}
        required={true}
      />
    );
  };

  const renderPrecisionToggle = () => {
    // Don't show toggle for UNIVERSAL mode - precision is always active
    if (selectedType === IMAGINE_TYPES.UNIVERSAL) {
      return null;
    }

    return (
      <FeatureToggle
        isActive={isPrecisionMode}
        onToggle={(checked) => {
          setIsPrecisionMode(checked);
          if (checked) {
            setSelectedInfrastructure([]);
          } else {
            setPrecisionInstruction('');
          }
        }}
        label="Präzisionsmodus"
        icon={PiCrosshair}
        description={isPrecisionMode
          ? "Aktiviert: Verwende detaillierte Textanweisungen für präzise Kontrolle"
          : "Deaktiviert: Verwende vorgefertigte Optionen für schnelle Auswahl"
        }
        disabled={isLoading}
        className="precision-mode-toggle"
      />
    );
  };

  const renderGreenEditForm = () => (
    <>
      <FileUpload
        handleChange={handleImageChange}
        allowedTypes={['.jpg', '.jpeg', '.png', '.webp']}
        file={uploadedImage}
        loading={isLoading}
        label="Straßenfoto hochladen"
      />

      {isPrecisionMode ? (
        <FormFieldWrapper
          label="Präzise Anweisungen"
        >
          <div>
            <TextAreaInput
              id="precision-instruction"
              value={precisionInstruction}
              onChange={(e) => setPrecisionInstruction(e.target.value)}
              placeholder="Beschreibe präzise, was wo hinzugefügt werden soll, z.B.: 'Füge drei große Linden auf der linken Straßenseite hinzu, platziere eine Bank unter dem zweiten Baum von links, erweitere den Gehweg um 1 Meter...'"
              rows={6}
              maxLength={500}
              disabled={isLoading}
            />
            {precisionInstruction.length >= 450 && (
              <div style={{
                fontSize: 'var(--font-size-small)',
                color: 'var(--text-color-secondary)',
                textAlign: 'right',
                marginTop: 'var(--spacing-xsmall)'
              }}>
                {precisionInstruction.length}/500 Zeichen
              </div>
            )}
          </div>
        </FormFieldWrapper>
      ) : (
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
            isDisabled={isLoading}
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
      )}
    </>
  );

  const renderAllyMakerForm = () => (
    <>
      <AllyMakerForm
        ref={allyMakerFormRef}
        loading={isLoading}
        isPrecisionMode={isPrecisionMode}
      />
    </>
  );

  const renderUniversalForm = () => (
    <>
      <FileUpload
        handleChange={handleImageChange}
        allowedTypes={['.jpg', '.jpeg', '.png', '.webp']}
        file={uploadedImage}
        loading={isLoading}
        label="Bild hochladen"
      />

      <FormFieldWrapper
        label="Bearbeitungsanweisungen"
        helpText="Beschreibe detailliert, was im Bild verändert werden soll (mindestens 15 Zeichen)"
      >
        <div>
          <TextAreaInput
            id="universal-instruction"
            value={precisionInstruction}
            onChange={(e) => setPrecisionInstruction(e.target.value)}
            placeholder="Beschreibe präzise, welche Änderungen vorgenommen werden sollen, z.B.: 'Ersetze den Himmel durch einen Sonnenuntergang, füge einen Hund im Vordergrund hinzu...'"
            rows={6}
            maxLength={500}
            disabled={isLoading}
          />
          {precisionInstruction.length >= 450 && (
            <div style={{
              fontSize: 'var(--font-size-small)',
              color: 'var(--text-color-secondary)',
              textAlign: 'right',
              marginTop: 'var(--spacing-xsmall)'
            }}>
              {precisionInstruction.length}/500 Zeichen
            </div>
          )}
        </div>
      </FormFieldWrapper>
    </>
  );

  const renderFormInputs = () => {
    if (selectedType === IMAGINE_TYPES.GREEN_EDIT) {
      return renderGreenEditForm();
    } else if (selectedType === IMAGINE_TYPES.ALLY_MAKER) {
      return renderAllyMakerForm();
    } else if (selectedType === IMAGINE_TYPES.UNIVERSAL) {
      return renderUniversalForm();
    }
    return null;
  };


  const generatedContent = form.generator.generatedContent || '';

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          key={selectedType}
          {...form.generator.baseFormProps}
          loading={isLoading}
          title={<span className="gradient-title">{IMAGINE_TYPE_TITLES[selectedType]}</span>}
          onSubmit={form.handleSubmit(customSubmit)}
          generatedContent={generatedContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          submitButtonText={getSubmitButtonText()}
          isSubmitDisabled={getSubmitDisabled()}
          firstExtrasChildren={
            <>
              {renderTypeSelector()}
              {renderPrecisionToggle()}
            </>
          }
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
