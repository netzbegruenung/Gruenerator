import React, { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useForm } from 'react-hook-form';

import FileUpload from '../../../../components/common/FileUpload';
import { useFormFields } from '../../../../components/common/Form/hooks';
// import { HiUpload, HiTemplate } from 'react-icons/hi';
// import CanvaSelector from './CanvaSelector';

interface AltTextFormProps {
  tabIndex?: {
    fileUpload?: number;
    imageDescription?: number;
    [key: string]: number | undefined;
  };
}

interface AltTextFormRef {
  getFormData: () => Record<string, unknown>;
  isValid: () => boolean;
  setCanvaDesign?: (designData: unknown) => void;
}

interface CanvaDesign {
  type: string;
  design: unknown;
  imageUrl?: string;
  title?: string;
}

const AltTextForm = forwardRef<AltTextFormRef, AltTextFormProps>(({ tabIndex = {} }, ref) => {
  const { Input } = useFormFields() as unknown as { Input: React.ComponentType<any> };

  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [selectedCanvaDesign, setSelectedCanvaDesign] = useState<CanvaDesign | null>(null);
  const [imageSource, setImageSource] = useState<'upload' | 'canva'>('upload');

  const {
    control,
    getValues,
    formState: { errors },
  } = useForm({
    defaultValues: {
      imageDescription: '',
    },
  });

  const handleImageChange = useCallback((file: File | null) => {
    setUploadedImage(file);
    setSelectedCanvaDesign(null); // Clear Canva selection when file is uploaded
  }, []);

  // Canva selection temporarily disabled
  /*
  const handleCanvaImageSelect = useCallback(async (selectionData) => {
    try {
      console.log('[AltTextForm] Canva image selected:', selectionData);
      setSelectedCanvaDesign(selectionData);
      setUploadedImage(null); // Clear file upload when Canva is selected
    } catch (error) {
      console.error('[AltTextForm] Error handling Canva selection:', error);
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
  */

  // Expose form data to parent component
  useImperativeHandle(
    ref,
    () => ({
      getFormData: () => {
        const formData = getValues();
        return {
          ...formData,
          uploadedImage,
          selectedCanvaDesign,
          imageSource,
          hasUploadedImage: uploadedImage !== null,
          hasCanvaImage: selectedCanvaDesign !== null,
        };
      },
      isValid: () => {
        return uploadedImage !== null;
      },
      setCanvaDesign: (designData: unknown) => {
        const typedDesignData = designData as {
          template?: {
            id?: string;
            thumbnail_url?: string;
            preview_image_url?: string;
            title?: string;
          };
        } | null;
        if (typedDesignData && typedDesignData.template) {
          setImageSource('canva');
          setSelectedCanvaDesign({
            type: 'canva',
            design: typedDesignData.template,
            imageUrl:
              typedDesignData.template.thumbnail_url || typedDesignData.template.preview_image_url,
            title: typedDesignData.template.title,
          });
          setUploadedImage(null);
        }
      },
    }),
    [getValues, uploadedImage, selectedCanvaDesign, imageSource]
  );

  return (
    <>
      {/**
      <div className="form-field-wrapper">
        <label className="form-field-label">Bildquelle wählen</label>
        <div className="image-source-toggle">
          <button
            type="button"
            className={`toggle-button ${imageSource === 'upload' ? 'active' : ''}`}
            onClick={() => handleImageSourceToggle('upload')}
            tabIndex={tabIndex.imageSourceUpload}
          >
            <HiUpload className="toggle-icon" />
            Datei hochladen
          </button>
          <button
            type="button"
            className={`toggle-button ${imageSource === 'canva' ? 'active' : ''}`}
            onClick={() => handleImageSourceToggle('canva')}
            tabIndex={tabIndex.imageSourceCanva}
          >
            <HiTemplate className="toggle-icon" />
            Aus Canva wählen
          </button>
        </div>
      </div>

      {imageSource === 'upload' ? (
        <FileUpload
          handleChange={handleImageChange}
          allowedTypes={['.jpg', '.jpeg', '.png', '.webp']}
          file={uploadedImage}
          label="Bild für Alt-Text (erforderlich)"
          tabIndex={tabIndex.fileUpload}
        />
      ) : (
        <div className="form-field-wrapper">
          <label className="form-field-label">Canva-Design auswählen</label>
          <CanvaSelector
            onImageSelect={handleCanvaImageSelect}
            selectedImageId={selectedCanvaDesign?.design?.id}
          />
        </div>
      )}
      */}
      <FileUpload
        handleChange={handleImageChange}
        allowedTypes={['.jpg', '.jpeg', '.png', '.webp']}
        file={uploadedImage}
        label="Bild für Alt-Text (erforderlich)"
        tabIndex={tabIndex.fileUpload}
      />

      <Input
        name="imageDescription"
        control={control}
        label="Zusätzliche Bildbeschreibung (optional)"
        placeholder="z.B. Kontext, Zweck oder besondere Details des Bildes..."
        maxRows={3}
        tabIndex={tabIndex.imageDescription}
      />
    </>
  );
});

AltTextForm.displayName = 'AltTextForm';

export default AltTextForm;
