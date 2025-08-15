import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { HiUpload, HiTemplate } from 'react-icons/hi';
import BaseForm from '../../../components/common/BaseForm';
import useAltTextGeneration from '../../../components/hooks/useAltTextGeneration';
import { useFormFields } from '../../../components/common/Form/hooks';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { fileToBase64 } from '../../../utils/fileAttachmentUtils';
import FileUpload from '../../../components/common/FileUpload';
import ErrorBoundary from '../../../components/ErrorBoundary';
import CanvaSelector from './components/CanvaSelector';
import { convertCanvaDesignToBase64 } from './utils/canvaImageHelper';
import './styles/canva-selector.css';

const AltTextGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'alt-text';
  const { Input } = useFormFields();
  const { setGeneratedText } = useGeneratedTextStore();
  const [searchParams] = useSearchParams();
  
  const [uploadedImage, setUploadedImage] = useState(null);
  const [selectedCanvaDesign, setSelectedCanvaDesign] = useState(null);
  const [imageSource, setImageSource] = useState('upload'); // 'upload' or 'canva'
  const [generatedAltText, setGeneratedAltText] = useState('');
  
  const {
    loading,
    success,
    error,
    generateAltTextForImage,
    resetSuccess
  } = useAltTextGeneration();
  
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));

  // Handle pre-selected Canva template from URL parameters
  useEffect(() => {
    const canvaTemplateParam = searchParams.get('canvaTemplate');
    if (canvaTemplateParam) {
      try {
        // Get template data from sessionStorage
        const sessionData = sessionStorage.getItem(canvaTemplateParam);
        if (sessionData) {
          const parsedData = JSON.parse(sessionData);
          
          if (parsedData.source === 'canvaTemplate' && parsedData.template) {
            console.log('[AltTextGenerator] Pre-selecting Canva template from URL:', parsedData.template.title);
            
            // Switch to Canva mode
            setImageSource('canva');
            
            // Set the selected design
            setSelectedCanvaDesign({
              type: 'canva',
              design: parsedData.template,
              imageUrl: parsedData.template.thumbnail_url || parsedData.template.preview_image_url,
              title: parsedData.template.title
            });
            
            // Clear uploaded image
            setUploadedImage(null);
            
            // Clean up sessionStorage
            sessionStorage.removeItem(canvaTemplateParam);
            
            console.log('[AltTextGenerator] Canva template pre-selected successfully');
          }
        }
      } catch (error) {
        console.error('[AltTextGenerator] Error processing Canva template parameter:', error);
      }
    }
  }, [searchParams]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm({
    defaultValues: {
      imageDescription: ''
    }
  });

  const handleImageChange = useCallback((file) => {
    setUploadedImage(file);
    setSelectedCanvaDesign(null); // Clear Canva selection when file is uploaded
  }, []);

  const handleCanvaImageSelect = useCallback(async (selectionData) => {
    try {
      console.log('[AltTextGenerator] Canva image selected:', selectionData);
      setSelectedCanvaDesign(selectionData);
      setUploadedImage(null); // Clear file upload when Canva is selected
    } catch (error) {
      console.error('[AltTextGenerator] Error handling Canva selection:', error);
    }
  }, []);

  const handleImageSourceToggle = useCallback((source) => {
    setImageSource(source);
    // Clear selections when switching sources
    if (source === 'upload') {
      setSelectedCanvaDesign(null);
    } else {
      setUploadedImage(null);
    }
  }, []);

  const onSubmitRHF = useCallback(async (formData) => {
    const hasUploadedImage = uploadedImage !== null;
    const hasCanvaImage = selectedCanvaDesign !== null;
    
    if (!hasUploadedImage && !hasCanvaImage) {
      console.error('[AltTextGenerator] No image selected');
      return;
    }

    try {
      console.log('[AltTextGenerator] Starting alt text generation');
      
      let imageBase64;
      let imageContext = '';
      
      if (imageSource === 'upload' && hasUploadedImage) {
        // Convert uploaded file to base64
        imageBase64 = await fileToBase64(uploadedImage);
        imageContext = `Bild: ${uploadedImage.name}`;
      } else if (imageSource === 'canva' && hasCanvaImage) {
        // Convert Canva design to base64
        const conversionResult = await convertCanvaDesignToBase64(selectedCanvaDesign.design);
        imageBase64 = conversionResult.base64;
        imageContext = `Canva Design: ${selectedCanvaDesign.title || 'Untitled'}`;
      } else {
        throw new Error('Invalid image source or missing image data');
      }
      
      // Combine user description with image context
      let fullDescription = formData.imageDescription || '';
      if (imageContext) {
        fullDescription = fullDescription 
          ? `${imageContext}. ${fullDescription}`
          : imageContext;
      }
      
      // Generate alt text
      const response = await generateAltTextForImage(
        imageBase64, 
        fullDescription || null
      );
      
      const altText = response?.altText || response || '';
      
      setGeneratedAltText(altText);
      setGeneratedText(componentName, altText);
      
      console.log('[AltTextGenerator] Alt text generated successfully');
      setTimeout(resetSuccess, 3000);
      
    } catch (error) {
      console.error('[AltTextGenerator] Error generating alt text:', error);
    }
  }, [uploadedImage, selectedCanvaDesign, imageSource, generateAltTextForImage, setGeneratedText, resetSuccess]);

  const handleGeneratedContentChange = useCallback((content) => {
    setGeneratedAltText(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  const helpContent = {
    content: "Erstelle barrierefreie Alt-Texte für Bilder nach den Richtlinien des Deutschen Blinden- und Sehbehindertenverbands (DBSV). Alt-Texte sind essentiell für Screenreader und die Zugänglichkeit von Webinhalten.",
    tips: [
      "Wähle zwischen Datei-Upload oder Canva-Design",
      "Lade ein Bild hoch (JPG, PNG, WebP) oder wähle aus deinen Canva-Designs",
      "Füge optional eine Beschreibung hinzu für besseren Kontext",
      "Der generierte Alt-Text folgt DBSV-Richtlinien für Barrierefreiheit",
      "Alt-Texte sollten prägnant aber beschreibend sein",
      "Verwende den generierten Text direkt in deinen Webinhalten"
    ]
  };

  const renderFormInputs = () => (
    <>
      {/* Image Source Toggle */}
      <div className="form-field-wrapper">
        <label className="form-field-label">Bildquelle wählen</label>
        <div className="image-source-toggle">
          <button
            type="button"
            className={`toggle-button ${imageSource === 'upload' ? 'active' : ''}`}
            onClick={() => handleImageSourceToggle('upload')}
          >
            <HiUpload className="toggle-icon" />
            Datei hochladen
          </button>
          <button
            type="button"
            className={`toggle-button ${imageSource === 'canva' ? 'active' : ''}`}
            onClick={() => handleImageSourceToggle('canva')}
          >
            <HiTemplate className="toggle-icon" />
            Aus Canva wählen
          </button>
        </div>
      </div>

      {/* Conditional Image Input */}
      {imageSource === 'upload' ? (
        <FileUpload
          handleChange={handleImageChange}
          allowedTypes={['.jpg', '.jpeg', '.png', '.webp']}
          file={uploadedImage}
          loading={loading}
          label="Bild für Alt-Text (erforderlich)"
        />
      ) : (
        <div className="form-field-wrapper">
          <label className="form-field-label">Canva-Design auswählen</label>
          <CanvaSelector
            onImageSelect={handleCanvaImageSelect}
            selectedImageId={selectedCanvaDesign?.design?.id}
            loading={loading}
          />
        </div>
      )}

      <Input
        name="imageDescription"
        control={control}
        label="Zusätzliche Bildbeschreibung (optional)"
        placeholder="z.B. Kontext, Zweck oder besondere Details des Bildes..."
        maxRows={3}
      />
    </>
  );

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title="Alt-Text Grünerator"
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={loading}
          success={success}
          error={error}
          generatedContent={storeGeneratedText || generatedAltText}
          onGeneratedContentChange={handleGeneratedContentChange}
          helpContent={helpContent}
          componentName={componentName}
          submitButtonText="Alt-Text generieren"
          isSubmitDisabled={!uploadedImage && !selectedCanvaDesign}
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

AltTextGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default AltTextGenerator;