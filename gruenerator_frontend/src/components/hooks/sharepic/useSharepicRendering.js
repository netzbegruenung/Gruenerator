import React from 'react';
import { FORM_STEPS, SHAREPIC_TYPES } from '../../utils/constants';
import FileUpload from '../../utils/FileUpload';

export const useSharepicRendering = () => {
  const renderFormFields = (currentStep, formData, handleChange, handleFileChange, formErrors = {}, file, uploadError, isLoading) => {
    let fields = null;

    if (currentStep === FORM_STEPS.INPUT) {
      fields = (
        <>
          <h3><label htmlFor="type">Sharepic-Typ</label></h3>
          <select 
            id="type"
            name="type"
            value={formData.type || ''} 
            onChange={handleChange}
            className={formErrors.type ? 'error-input' : ''}
          >
            <option value="">Bitte wählen</option>
            <option value={SHAREPIC_TYPES.QUOTE}>{SHAREPIC_TYPES.QUOTE}</option>
            <option value={SHAREPIC_TYPES.THREE_LINES}>{SHAREPIC_TYPES.THREE_LINES}</option>
          </select>
          {formErrors.type && <div className="error-message">{formErrors.type}</div>}

          <h3><label htmlFor="thema">Thema</label></h3>
          <input
            id="thema"
            name="thema"
            type="text"
            placeholder="Klimaschutzinitiative"
            value={formData.thema || ''}
            onChange={handleChange}
            className={formErrors.thema ? 'error-input' : ''}
          />
          {formErrors.thema && <div className="error-message">{formErrors.thema}</div>}

          <h3><label htmlFor="details">Details</label></h3>
          <textarea
            id="details"
            name="details"
            placeholder="Details zur Initiative, beteiligte Personen und geplante Aktionen."
            value={formData.details || ''}
            onChange={handleChange}
            className={formErrors.details ? 'error-input' : ''}
          />
          {formErrors.details && <div className="error-message">{formErrors.details}</div>}
        </>
      );
    }

    if (currentStep === FORM_STEPS.PREVIEW || currentStep === FORM_STEPS.RESULT) {
      fields = formData.type === SHAREPIC_TYPES.QUOTE ? (
        <>
          <h3><label htmlFor="quote">Zitat</label></h3>
          <textarea
            id="quote"
            name="quote"
            placeholder="Gib das Zitat ein"
            value={formData.quote || ''}
            onChange={handleChange}
            className={formErrors.quote ? 'error-input' : ''}
          />
          {formErrors.quote && <div className="error-message">{formErrors.quote}</div>}

          <h3><label htmlFor="name">Name</label></h3>
          <input
            id="name"
            type="text"
            name="name"
            placeholder="Gib den Namen ein"
            value={formData.name || ''}
            onChange={handleChange}
            className={formErrors.name ? 'error-input' : ''}
          />
          {formErrors.name && <div className="error-message">{formErrors.name}</div>}
        </>
      ) : (
        <>
          <h3><label htmlFor="line1">Zeile 1</label></h3>
          <input
            id="line1"
            type="text"
            name="line1"
            value={formData.line1 || ''}
            onChange={handleChange}
            className={formErrors.line1 ? 'error-input' : ''}
          />
          {formErrors.line1 && <div className="error-message">{formErrors.line1}</div>}

          <h3><label htmlFor="line2">Zeile 2</label></h3>
          <input
            id="line2"
            type="text"
            name="line2"
            value={formData.line2 || ''}
            onChange={handleChange}
            className={formErrors.line2 ? 'error-input' : ''}
          />
          {formErrors.line2 && <div className="error-message">{formErrors.line2}</div>}

          <h3><label htmlFor="line3">Zeile 3</label></h3>
          <input
            id="line3"
            type="text"
            name="line3"
            value={formData.line3 || ''}
            onChange={handleChange}
            className={formErrors.line3 ? 'error-input' : ''}
          />
          {formErrors.line3 && <div className="error-message">{formErrors.line3}</div>}
        </>
      );

      // Füge FileUpload am Ende hinzu
      fields = (
        <>
          {fields}
          <FileUpload
            loading={isLoading}
            file={file}
            handleChange={handleFileChange}
            error={uploadError}
            allowedTypes={['image/*']}
          />
        </>
      );
    }

    return fields;
  };

  return { renderFormFields };
};