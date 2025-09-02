import React, { forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import CreatableSelect from 'react-select/creatable';
import FileUpload from '../../components/common/FileUpload';
import FormFieldWrapper from '../../components/common/Form/Input/FormFieldWrapper';

const AllyMakerForm = forwardRef(({ loading }, ref) => {
  const [uploadedImage, setUploadedImage] = useState(null);
  const [selectedPlacement, setSelectedPlacement] = useState([]);

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
      placement: selectedPlacement.length > 0 
        ? selectedPlacement.map(opt => opt.label || opt.value).join(', ')
        : ''
    }),
    resetForm: () => {
      setUploadedImage(null);
      setSelectedPlacement([]);
    },
    isValid: () => !!uploadedImage
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
    </>
  );
});

AllyMakerForm.displayName = 'AllyMakerForm';

export default AllyMakerForm;