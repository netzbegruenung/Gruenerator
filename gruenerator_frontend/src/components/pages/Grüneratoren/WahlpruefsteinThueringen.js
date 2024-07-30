import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { PiClipboardText, PiGear } from 'react-icons/pi';
import '../../../assets/styles/common/variables.css';
import '../../../assets/styles/common/global.css';
import '../../../assets/styles/components/form.css';
import '../../../assets/styles/components/button.css';
import '../../../assets/styles/pages/baseform.css';
import { handleCopyToClipboard, useDynamicTextSize } from '../../utils/commonFunctions';
import axios from 'axios';

const WahlpruefsteinThueringen = ({ showHeaderFooter = true }) => {
  const [question, setQuestion] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const textSize = useDynamicTextSize(response, 1.2, 0.8, [1000, 2000]);

  useEffect(() => {
    // Hier könnte man eine Funktion hinzufügen, die beim Laden der Komponente
    // die verfügbaren Programmsektionen vom Server abruft, falls nötig
  }, []);

  const handleSubmit = async () => {
    if (!question.trim() || !selectedSection) {
      setError('Bitte geben Sie eine Frage ein und wählen Sie einen Themenbereich aus.');
      return;
    }

    setLoading(true);
    setSuccess(false);
    setError('');
    setResponse('');

    try {
      const apiResponse = await axios.post('/api/wahlpruefsteinthueringen/frage', {
        question: question.trim(),
        sectionIndex: parseInt(selectedSection, 10),
      });

      if (apiResponse.data && apiResponse.data.content) {
        setResponse(apiResponse.data.content);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000); // Show success checkmark for 2 seconds
      } else {
        throw new Error('Unerwartete Antwortstruktur von der API');
      }
    } catch (error) {
      console.error('Error processing the question:', error);
      setError(error.response?.data?.message || error.message || 'Fehler bei der Verarbeitung der Frage');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <div className="form-container">
        <h3>Stellen Sie Ihre Frage</h3>
        <textarea 
          placeholder="Stellen Sie hier Ihre Frage zum Wahlprogramm..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        <h3>Wählen Sie einen Themenbereich</h3>
        <select 
          value={selectedSection} 
          onChange={(e) => setSelectedSection(e.target.value)}
        >
          <option value="">-- Bitte wählen --</option>
          <option value="0">🌳 Umwelt</option>
          <option value="1">⚖️ Gerechtigkeit</option>
          <option value="2">🌈 Vielfalt/Freiheit</option>
        </select>

        {error && <p className="error-message">{error}</p>}

        <button 
          onClick={handleSubmit} 
          className={`submit-button ${loading ? 'loading' : ''} ${success ? 'success' : ''}`}
          disabled={loading}
        >
          {loading ? <PiGear className="loading-icon" /> : (success ? <svg className="checkmark" viewBox="0 0 24 24">
            <path d="M20 6L9 17l-5-5" />
          </svg> : 'Absenden')}
        </button>
      </div>
      <div className="display-container">
        <h2>Ergebnis</h2>
        <div style={{ fontSize: textSize }} dangerouslySetInnerHTML={{ __html: response }}></div>
        {response && (
          <button onClick={() => handleCopyToClipboard(response)} className="copy-button">
            <PiClipboardText style={{ marginRight: '10px' }} /> In die Zwischenablage kopieren
          </button>
        )}
      </div>
    </div>
  );
};

WahlpruefsteinThueringen.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default WahlpruefsteinThueringen;