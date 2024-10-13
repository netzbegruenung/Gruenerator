import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import '../../../assets/styles/common/variables.css';
import '../../../assets/styles/common/global.css';
import '../../../assets/styles/components/button.css';
import '../../../assets/styles/pages/baseform.css';
import { useDynamicTextSize } from '../../utils/commonFunctions';
import useApiSubmit from '../../hooks/useApiSubmit';
import BaseForm from '../../common/BaseForm';

const Redengenerator = ({ showHeaderFooter = true }) => {
  const [rolle, setRolle] = useState('');
  const [thema, setThema] = useState('');
  const [zielgruppe, setZielgruppe] = useState('');
  const [schwerpunkte, setSchwerpunkte] = useState('');
  const [redezeit, setRedezeit] = useState('');
  const [rede, setRede] = useState('');
  const textSize = useDynamicTextSize(rede, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_rede');

  const handleSubmit = useCallback(async () => {
    const formData = { rolle, thema, zielgruppe, schwerpunkte, redezeit };
    try {
      const content = await submitForm(formData);
      if (content) {
        setRede(content);
        // Reset success after 3 seconds to match SubmitButton animation duration
        setTimeout(resetSuccess, 3000);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      // You might want to set an error state here or show a notification to the user
    }
  }, [rolle, thema, zielgruppe, schwerpunkte, redezeit, submitForm, resetSuccess]);

  const handleGeneratedContentChange = useCallback((content) => {
    console.log('Generated content changed:', content);
    setRede(content);
  }, [setRede]);

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title="Grünerator für politische Reden"
        onSubmit={handleSubmit}
        loading={loading}
        success={success}
        error={error}
        generatedContent={rede}
        textSize={textSize}
        onGeneratedContentChange={handleGeneratedContentChange}
      >
        <h3><label htmlFor="rolle">Rolle/Position des Redners</label></h3>
        <input
          id="rolle"
          type="text"
          name="rolle"
          placeholder="Sprecher*in der Grünen OV Musterdorf"
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
          placeholder="5-7"
          value={redezeit}
          onChange={(e) => setRedezeit(e.target.value)}
          aria-required="true"
        />
      </BaseForm>
    </div>
  );
};

Redengenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default Redengenerator;