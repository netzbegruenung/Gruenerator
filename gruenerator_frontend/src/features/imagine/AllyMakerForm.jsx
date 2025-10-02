import React, { forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import CreatableSelect from 'react-select/creatable';
import FileUpload from '../../components/common/FileUpload';
import FormFieldWrapper from '../../components/common/Form/Input/FormFieldWrapper';
import TextAreaInput from '../../components/common/Form/Input/TextAreaInput';

const AllyMakerForm = forwardRef(({ loading, isPrecisionMode = false }, ref) => {
  const [uploadedImage, setUploadedImage] = useState(null);
  const [selectedPlacement, setSelectedPlacement] = useState([]);
  const [precisionPlacement, setPrecisionPlacement] = useState('');

  const placementOptions = [
    { value: 'wange', label: 'Wange' },
    { value: 'stirn_seitlich', label: 'Stirn seitlich' },
    { value: 'schlaefe', label: 'Schläfe' },
    { value: 'unter_auge', label: 'Unter dem Auge' },
    { value: 'oberarm', label: 'Oberarm' },
    { value: 'handgelenk', label: 'Handgelenk' }
  ];

  const handleImageChange = useCallback((file) => {
    setUploadedImage(file);
  }, []);

  const handlePlacementChange = useCallback((newValues) => {
    const selectedValues = newValues || [];
    setSelectedPlacement(selectedValues);
  }, []);

  useImperativeHandle(ref, () => ({
    getFormData: () => ({
      image: uploadedImage,
      placement: isPrecisionMode
        ? precisionPlacement
        : (selectedPlacement.length > 0
            ? selectedPlacement.map(opt => opt.label || opt.value).join(', ')
            : '')
    }),
    resetForm: () => {
      setUploadedImage(null);
      setSelectedPlacement([]);
      setPrecisionPlacement('');
    },
    isValid: () => {
      if (!uploadedImage) return false;
      if (isPrecisionMode) {
        return precisionPlacement.trim().length >= 5;
      }
      return true;
    }
  }));

  return (
    <>
      <FileUpload
        handleChange={handleImageChange}
        allowedTypes={['.jpg', '.jpeg', '.png', '.webp']}
        file={uploadedImage}
        loading={loading}
        label="Foto der Person hochladen"
      />

      {isPrecisionMode ? (
        <FormFieldWrapper
          label="Präzise Tattoo-Platzierung"
          helpText="Beschreibe genau, wo das Regenbogen-Tattoo platziert werden soll (mindestens 5 Zeichen)"
        >
          <div>
            <TextAreaInput
              id="precision-placement"
              value={precisionPlacement}
              onChange={(e) => setPrecisionPlacement(e.target.value)}
              placeholder="Beschreibe präzise, wo das Tattoo platziert werden soll, z.B.: 'Kleines Regenbogen-Tattoo auf der linken Wange, etwa 2cm unter dem Auge, nicht größer als 1cm...'"
              rows={4}
              maxLength={200}
              disabled={loading}
            />
            {precisionPlacement.length >= 180 && (
              <div style={{
                fontSize: 'var(--font-size-small)',
                color: 'var(--text-color-secondary)',
                textAlign: 'right',
                marginTop: 'var(--spacing-xsmall)'
              }}>
                {precisionPlacement.length}/200 Zeichen
              </div>
            )}
          </div>
        </FormFieldWrapper>
      ) : (
        <FormFieldWrapper
          label="Tattoo-Platzierung (optional)"
          helpText="Wähle die gewünschte Stelle für das Regenbogen-Tattoo oder gib eine eigene an"
        >
          <CreatableSelect
            classNamePrefix="react-select"
            isMulti={false}
            options={placementOptions}
            value={selectedPlacement[0] || null}
            onChange={(newValue) => handlePlacementChange(newValue ? [newValue] : [])}
            placeholder="z.B. Wange, Stirn oder eigene Stelle eingeben..."
            noOptionsMessage={() => "Keine passende Stelle gefunden"}
            formatCreateLabel={(inputValue) => `Eigene Stelle: "${inputValue}"`}
            createOptionPosition="first"
            isClearable={true}
            isSearchable={true}
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
      )}
    </>
  );
});

AllyMakerForm.displayName = 'AllyMakerForm';

export default AllyMakerForm;