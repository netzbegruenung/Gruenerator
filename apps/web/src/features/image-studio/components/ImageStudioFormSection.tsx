import { Input, Textarea } from '@gruenerator/ui';
import React from 'react';

import useImageStudioStore from '../../../stores/imageStudioStore';
import { EditInstructionForm } from '../forms';
import { type ImageStudioFormSectionProps } from '../types/componentTypes';
import { IMAGE_STUDIO_TYPES, FORM_STEPS } from '../utils/typeConfig';

const ImageStudioFormSection: React.FC<ImageStudioFormSectionProps> = ({
  type,
  currentStep,
  typeConfig,
  formErrors,
  handleChange,
  updateFormData,
}) => {
  const { thema, details, quote, header, subheader, body, line1, line2, line3, purePrompt } =
    useImageStudioStore();
  const loading = false; // Loading is managed by parent

  if (typeConfig?.hasTextGeneration && currentStep === FORM_STEPS.INPUT) {
    return (
      <>
        <div className="form-field-wrapper">
          <h3>
            <label htmlFor="thema">Thema</label>
          </h3>
          <Input
            type="text"
            id="thema"
            name="thema"
            value={thema}
            onChange={handleChange}
            placeholder="z.B. Klimaschutz, Verkehrswende..."
            className={formErrors.thema ? 'error-input' : ''}
          />
          {formErrors.thema && <span className="error-message">{formErrors.thema}</span>}
        </div>
        <div className="form-field-wrapper">
          <h3>
            <label htmlFor="details">Details (optional)</label>
          </h3>
          <Textarea
            id="details"
            name="details"
            value={details}
            onChange={handleChange}
            placeholder="Zusätzliche Informationen..."
            rows={3}
          />
        </div>
      </>
    );
  }

  if (typeConfig?.usesFluxApi && currentStep === FORM_STEPS.INPUT) {
    if (type === IMAGE_STUDIO_TYPES.PURE_CREATE) {
      return (
        <div className="form-field-wrapper">
          <h3>
            <label htmlFor="purePrompt">Bildbeschreibung</label>
          </h3>
          <Textarea
            id="purePrompt"
            name="purePrompt"
            value={purePrompt}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              updateFormData({ purePrompt: e.target.value })
            }
            placeholder="Beschreibe das Bild, das du erstellen möchtest..."
            rows={4}
            className={formErrors.purePrompt ? 'error-input' : ''}
          />
          {formErrors.purePrompt && <span className="error-message">{formErrors.purePrompt}</span>}
        </div>
      );
    }
    if (typeConfig?.formProps) {
      return (
        <EditInstructionForm
          {...typeConfig.formProps}
          loading={loading}
          formErrors={formErrors as Record<string, string>}
        />
      );
    }
    return (
      <div className="form-field-wrapper">
        <p>Lade ein Bild hoch um fortzufahren.</p>
        {formErrors.uploadedImage && (
          <span className="error-message">{formErrors.uploadedImage}</span>
        )}
      </div>
    );
  }

  if (currentStep === FORM_STEPS.PREVIEW || currentStep === FORM_STEPS.RESULT) {
    if (typeConfig?.legacyType === 'Zitat' || typeConfig?.legacyType === 'Zitat_Pure') {
      return (
        <div className="form-field-wrapper">
          <h3>
            <label htmlFor="quote">Zitat</label>
          </h3>
          <Textarea id="quote" name="quote" value={quote} onChange={handleChange} rows={3} />
        </div>
      );
    }
    if (typeConfig?.legacyType === 'Info') {
      return (
        <>
          <div className="form-field-wrapper">
            <h3>
              <label htmlFor="header">Header</label>
            </h3>
            <Input type="text" id="header" name="header" value={header} onChange={handleChange} />
          </div>
          <div className="form-field-wrapper">
            <h3>
              <label htmlFor="subheader">Subheader</label>
            </h3>
            <Input
              type="text"
              id="subheader"
              name="subheader"
              value={subheader}
              onChange={handleChange}
            />
          </div>
          <div className="form-field-wrapper">
            <h3>
              <label htmlFor="body">Body</label>
            </h3>
            <Textarea id="body" name="body" value={body} onChange={handleChange} rows={3} />
          </div>
        </>
      );
    }
    return (
      <>
        <div className="form-field-wrapper">
          <h3>
            <label htmlFor="line1">Zeile 1</label>
          </h3>
          <Input type="text" id="line1" name="line1" value={line1} onChange={handleChange} />
        </div>
        <div className="form-field-wrapper">
          <h3>
            <label htmlFor="line2">Zeile 2</label>
          </h3>
          <Input type="text" id="line2" name="line2" value={line2} onChange={handleChange} />
        </div>
        <div className="form-field-wrapper">
          <h3>
            <label htmlFor="line3">Zeile 3</label>
          </h3>
          <Input type="text" id="line3" name="line3" value={line3} onChange={handleChange} />
        </div>
      </>
    );
  }

  return null;
};

export default ImageStudioFormSection;
