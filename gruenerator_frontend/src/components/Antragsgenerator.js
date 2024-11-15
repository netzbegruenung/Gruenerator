import React, { useState } from 'react';
import BaseForm from './common/BaseForm';
import useApiSubmit from './hooks/useApiSubmit';
import { validateForm } from './utils/formValidation';

const Antragsgenerator = () => {
  const [formErrors, setFormErrors] = useState({});
  const { submitForm, loading, success, error } = useApiSubmit('/claude');

  const handleSubmit = async (formData) => {
    // Formularvalidierung
    const validationErrors = validateForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors);
      return;
    }
    setFormErrors({});

    try {
      console.log('[Antragsgenerator] Submitting form data:', formData);
      const result = await submitForm(formData);
      
      if (result) {
        console.log('[Antragsgenerator] Submit successful:', result);
      }
    } catch (err) {
      console.error('[Antragsgenerator] Submit error:', err);
    }
  };

  const handleGeneratePost = async () => {
    try {
      const result = await submitForm({
        type: 'generate_post',
        // weitere Parameter je nach Bedarf
      });
      return result;
    } catch (err) {
      console.error('[Antragsgenerator] Generate post error:', err);
      return null;
    }
  };

  return (
    <BaseForm
      title="Antragsgenerator"
      onSubmit={handleSubmit}
      loading={loading}
      success={success}
      error={error}
      formErrors={formErrors}
      onGeneratePost={handleGeneratePost}
      allowEditing={true}
    >
      {/* Formularfelder hier */}
      <div className="form-group">
        <label htmlFor="idee">Idee</label>
        <textarea
          id="idee"
          name="idee"
          placeholder="Beschreibe deine Idee..."
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="details">Details</label>
        <textarea
          id="details"
          name="details"
          placeholder="Weitere Details..."
        />
      </div>
      <div className="form-group">
        <label htmlFor="gliederung">Gliederung</label>
        <textarea
          id="gliederung"
          name="gliederung"
          placeholder="Optionale Gliederung..."
        />
      </div>
      <div className="form-group">
        <label htmlFor="antrag">Antrag</label>
        <textarea
          id="antrag"
          name="antrag"
          placeholder="Dein Antrag..."
        />
      </div>
    </BaseForm>
  );
};

export default Antragsgenerator; 