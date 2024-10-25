import React, { useState } from 'react';
import PropTypes from 'prop-types';
import useApiSubmit from '../hooks/useApiSubmit';
import { IoDocumentOutline, IoCopyOutline, IoOpenOutline, IoCloseOutline } from "react-icons/io5";
import '../../assets/styles/components/exportToDocument.css';

const ExportToDocument = ({ content }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [padURL, setPadURL] = useState('');
  const { submitForm, loading, error } = useApiSubmit('etherpad/create');

  const handleEtherpadExport = async () => {
    try {
      const result = await submitForm({ text: content });
      if (result && result.padURL) {
        setPadURL(result.padURL);
      } else {
        throw new Error('Keine gültige Pad-URL erhalten');
      }
    } catch (err) {
      console.error('Fehler beim Exportieren zu Grünerator Collaborate:', err);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(padURL).then(() => {
      alert('Link wurde in deine Zwischenablage kopiert!');
    }).catch(err => {
      console.error('Fehler beim Kopieren des Links:', err);
    });
  };

  const handleOpenLink = () => {
    window.open(padURL, '_blank');
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setPadURL(''); // Zurücksetzen der URL beim Schließen
  };

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="action-button export-button"
        aria-label="Zu Grünerator Collaborate exportieren"
      >
        <IoDocumentOutline size={16} />
      </button>
      {isModalOpen && (
        <div className="modal" role="dialog" aria-labelledby="export-modal-title" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={handleCloseModal}>
              <IoCloseOutline size={24} />
            </button>
            <h2 id="export-modal-title">Grünerator Collaborate Export</h2>
            {!padURL ? (
              <>
                <p>Möchtest du diesen Text in Grünerator Collaborate exportieren?</p>
                <p>Grünerator Collaborate ermöglicht die gemeinsame Textbearbeitung in Echtzeit. Mehrere Personen können gleichzeitig an einem Dokument arbeiten. Änderungen sind sofort für alle sichtbar, und das Dokument ist einfach über einen Link zugänglich. Perfekt für Brainstorming, gemeinsames Schreiben oder schnelle Zusammenarbeit an Texten.</p>
                <button 
                  onClick={handleEtherpadExport} 
                  disabled={loading}
                  className="export-action-button"
                >
                  {loading ? 'Wird exportiert...' : 'Zu Grünerator Collaborate exportieren'}
                </button>
              </>
            ) : (
              <>
                <p>Dein Text wurde erfolgreich in Grünerator Collaborate exportiert.</p>
                <div className="url-container">
                  <input type="text" value={padURL} readOnly className="url-input" />
                  <button onClick={handleCopyLink} className="copy-button">
                    <IoCopyOutline size={20} />
                  </button>
                </div>
                <button onClick={handleOpenLink} className="open-button">
                  <IoOpenOutline size={20} /> Link öffnen
                </button>
              </>
            )}
            {error && <p className="error-message" role="alert">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
};

ExportToDocument.propTypes = {
  content: PropTypes.string.isRequired,
};

export default ExportToDocument;
