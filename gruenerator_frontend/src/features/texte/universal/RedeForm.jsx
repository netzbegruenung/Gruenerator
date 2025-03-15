import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { useFormValidation } from '../../../components/hooks/useFormValidation';

const RedeForm = forwardRef((props, ref) => {
  const [rolle, setRolle] = useState('');
  const [thema, setThema] = useState('');
  const [zielgruppe, setZielgruppe] = useState('');
  const [schwerpunkte, setSchwerpunkte] = useState('');
  const [redezeit, setRedezeit] = useState('');

  const validationRules = {
    redezeit: { 
      required: true,
      min: 1,
      max: 5,
      message: 'Die Redezeit muss zwischen 1 und 3 Minuten liegen'
    }
  };

  const { errors, validateForm } = useFormValidation(validationRules);

  useImperativeHandle(ref, () => ({
    getFormData: () => {
      const formData = { rolle, thema, zielgruppe, schwerpunkte, redezeit };
      return validateForm(formData) ? formData : null;
    }
  }));

  return (
    <>
      <h3><label htmlFor="rolle">Rolle/Position</label></h3>
      <input
        id="rolle"
        type="text"
        name="rolle"
        placeholder="Sprecher*in der Grünen OV Musterdorf, Antragssteller*in etc."
        value={rolle}
        onChange={(e) => setRolle(e.target.value)}
        aria-required="true"
      />
      
      <h3><label htmlFor="thema">Spezifisches Thema oder Anlass der Rede</label></h3>
      <input
        id="thema"
        type="text"
        name="thema"
        placeholder="Umwelt- und Klimaschutz in der Stadt"
        value={thema}
        onChange={(e) => setThema(e.target.value)}
        aria-required="true"
      />
      
      <h3><label htmlFor="zielgruppe">Zielgruppe</label></h3>
      <input
        id="zielgruppe"
        type="text"
        name="zielgruppe"
        placeholder="Bürger*innen von Musterdorf"
        value={zielgruppe}
        onChange={(e) => setZielgruppe(e.target.value)}
        aria-required="true"
      />
      
      <h3><label htmlFor="schwerpunkte">Besondere Schwerpunkte oder lokale Aspekte</label></h3>
      <textarea
        id="schwerpunkte"
        name="schwerpunkte"
        style={{ height: '120px' }}
        placeholder="Durchführung von Projekten zur Förderung erneuerbarer Energien, Unterstützung lokaler Initiativen..."
        value={schwerpunkte}
        onChange={(e) => setSchwerpunkte(e.target.value)}
        aria-required="true"
      ></textarea>

      <h3><label htmlFor="redezeit">Gewünschte Redezeit (in Minuten)</label></h3>
      <input
        id="redezeit"
        type="number"
        name="redezeit"
        placeholder="1-5"
        value={redezeit}
        onChange={(e) => setRedezeit(e.target.value)}
        aria-required="true"
      />
      {errors.redezeit && <small className="error-text">{errors.redezeit}</small>}
      <small className="help-text">Maximal 5 Minuten möglich</small>
    </>
  );
});

RedeForm.displayName = 'RedeForm';

export default RedeForm; 