import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import { useFormValidation } from '../../../components/hooks/useFormValidation';

const WahlprogrammForm = forwardRef((props, ref) => {
  const [thema, setThema] = useState('');
  const [details, setDetails] = useState('');
  const [zeichenanzahl, setZeichenanzahl] = useState('');

  const validationRules = {
    thema: { 
      required: true,
      message: 'Bitte geben Sie ein Thema an'
    },
    zeichenanzahl: { 
      required: true,
      min: 1000,
      max: 3500,
      message: 'Die Zeichenanzahl muss zwischen 1.000 und 3.500 liegen'
    }
  };

  const { errors, validateForm } = useFormValidation(validationRules);

  useImperativeHandle(ref, () => ({
    getFormData: () => {
      const formData = { thema, details, zeichenanzahl };
      return validateForm(formData) ? formData : null;
    }
  }));

  return (
    <>
      <h3><label htmlFor="thema">{FORM_LABELS.THEME}</label></h3>
      <input
        id="thema"
        type="text"
        name="thema"
        placeholder={FORM_PLACEHOLDERS.THEME}
        value={thema}
        onChange={(e) => setThema(e.target.value)}
        aria-required="true"
      />
      {errors.thema && <small className="error-text">{errors.thema}</small>}
      
      <h3><label htmlFor="details">{FORM_LABELS.DETAILS}</label></h3>
      <textarea
        id="details"
        name="details"
        style={{ height: '120px' }}
        placeholder={FORM_PLACEHOLDERS.DETAILS}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        aria-required="true"
      ></textarea>

      <h3><label htmlFor="zeichenanzahl">{FORM_LABELS.CHARACTER_COUNT}</label></h3>
      <input
        id="zeichenanzahl"
        type="number"
        name="zeichenanzahl"
        placeholder="1000-3500"
        value={zeichenanzahl}
        onChange={(e) => setZeichenanzahl(e.target.value)}
        aria-required="true"
      />
      {errors.zeichenanzahl && <small className="error-text">{errors.zeichenanzahl}</small>}
      <small className="help-text">Zwischen 1.000 und 3.500 Zeichen möglich</small>
    </>
  );
});

WahlprogrammForm.displayName = 'WahlprogrammForm';

export default WahlprogrammForm; 