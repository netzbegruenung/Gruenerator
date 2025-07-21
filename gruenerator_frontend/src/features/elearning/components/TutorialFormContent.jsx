import React, { useState } from 'react';
import { useFormFields } from '../../../components/common/Form/hooks';

const TutorialFormContent = ({ onFormChange, currentStep }) => {
  const { Input, Textarea } = useFormFields();
  const [formData, setFormData] = useState({ thema: '', details: '' });

  const handleInputChange = (field, value) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);
    
    // Notify parent component of form changes for real-time preview
    if (onFormChange) {
      const hasThema = newFormData.thema?.trim().length > 0;
      const hasDetails = newFormData.details?.trim().length > 0;
      const isFormValid = hasThema && hasDetails;
      
      onFormChange({
        formData: newFormData,
        isFormValid
      });
    }
  };

  // Only show form fields on step 1 (interactive step)
  if (currentStep !== 1) {
    return (
      <div className="tutorial-welcome-content">
        <h3>Willkommen zum Tutorial!</h3>
        <p>In diesem Tutorial lernst du, wie der Universal Text Generator funktioniert und wie du ihn effektiv nutzen kannst.</p>
      </div>
    );
  }

  return (
    <>
      {/* Thema Field */}
      <div className="input-group">
        <label className="input-label">Thema</label>
        <input
          type="text"
          value={formData.thema}
          onChange={(e) => handleInputChange('thema', e.target.value)}
          placeholder="Gib hier dein Thema ein..."
          className="input-field"
        />
      </div>

      {/* Details Field */}
      <div className="input-group">
        <label className="input-label">Details & Beschreibung</label>
        <textarea
          value={formData.details}
          onChange={(e) => handleInputChange('details', e.target.value)}
          placeholder="Beschreibe hier genauer, worum es geht..."
          className="textarea-field"
          rows={3}
        />
      </div>
    </>
  );
};

export default TutorialFormContent;