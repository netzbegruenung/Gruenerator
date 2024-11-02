import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import useApiSubmit from '../hooks/useApiSubmit';
import { IoDocumentOutline, IoCopyOutline, IoOpenOutline, IoCloseOutline } from "react-icons/io5";
import '../../assets/styles/components/exportToDocument.css';

const ExportToDocument = ({ content, ...props }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [padURL, setPadURL] = useState('');
  const [hasExistingPad, setHasExistingPad] = useState(false);
  const { submitForm, loading, error } = useApiSubmit('etherpad/create');

  // Beim ersten Rendern prüfen, ob bereits ein Link existiert
  useEffect(() => {
    const existingPadURL = sessionStorage.getItem('padURL');
    if (existingPadURL) {
      setPadURL(existingPadURL);
      setHasExistingPad(true);
    }
  }, []);

  // Funktion zum Bereinigen des HTML-Texts
  const cleanHtmlContent = (htmlContent) => {
    // Temporäres div-Element erstellen
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // Text extrahieren und Formatierungen entfernen
    let cleanText = '';
    const processNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        cleanText += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'P' || node.tagName === 'DIV') {
          if (cleanText && !cleanText.endsWith('\n')) {
            cleanText += '\n';
          }
        }
        node.childNodes.forEach(processNode);
        if (node.tagName === 'P' || node.tagName === 'DIV') {
          if (!cleanText.endsWith('\n')) {
            cleanText += '\n';
          }
        }
      }
    };
    
    processNode(tempDiv);
    return cleanText.trim();
  };

  const handleEtherpadExport = async () => {
    // Wenn bereits ein Pad existiert, verwenden wir die bestehende URL
    if (hasExistingPad) {
      return;
    }

    try {
      const cleanContent = cleanHtmlContent(content);
      const result = await submitForm({ text: cleanContent });
      if (result && result.padURL) {
        setPadURL(result.padURL);
        setHasExistingPad(true);
        // Speichern der URL in der Session
        sessionStorage.setItem('padURL', result.padURL);
      } else {
        throw new Error('Keine gültige Pad-URL erhalten');
      }
    } catch (err) {
      console.error('Fehler beim Exportieren zu Grünerator Collaborate:', err);
    }
  };

  const handleCopyCollaborateLink = () => {
    navigator.clipboard.writeText(padURL).then(() => {
      alert('Collaborate-Link wurde in deine Zwischenablage kopiert!');
    }).catch(err => {
      console.error('Fehler beim Kopieren des Collaborate-Links:', err);
    });
  };

  const handleOpenLink = () => {
    window.open(padURL, '_blank');
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleExport = () => {
    setIsModalOpen(true); // Öffnet das Modal
  };

  // Modal-Komponente als separates Element
  const Modal = () => {
    return ReactDOM.createPortal(
      <div className="modal" role="dialog" aria-labelledby="export-modal-title" onClick={handleCloseModal}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <button className="close-button" onClick={handleCloseModal}>
            <IoCloseOutline size={24} />
          </button>
          <h2 id="export-modal-title">Grünerator Collaborate Export</h2>
          {!hasExistingPad ? (
            <>
              <p>Möchtest du diesen Text in Grünerator Collaborate exportieren?</p>
              <p>Grünerator Collaborate ermöglicht die gemeinsame Textbearbeitung in Echtzeit. Mehrere Personen können gleichzeitig an einem Dokument arbeiten. Änderungen sind sofort für alle sichtbar, und das Dokument ist einfach über einen Link zugänglich. Perfekt für Brainstorming, gemeinsames Schreiben oder schnelle Zusammenarbeit an Texten.</p>
              {padURL ? (
                <>
                  <p>Hier ist dein Link zum Collaborate-Dokument:</p>
                  <div className="url-container">
                    <input type="text" value={padURL} readOnly className="url-input" />
                    <button onClick={handleCopyCollaborateLink} className="copy-collaborate-link-button">
                      <IoCopyOutline size={20} />
                    </button>
                  </div>
                  <button onClick={handleOpenLink} className="open-button">
                    <IoOpenOutline size={20} /> Link öffnen
                  </button>
                </>
              ) : (
                <button 
                  onClick={handleEtherpadExport} 
                  disabled={loading}
                  className="export-action-button"
                >
                  {loading ? 'Wird exportiert...' : 'Zu Grünerator Collaborate exportieren'}
                </button>
              )}
            </>
          ) : (
            <>
              <p>Dein Text wurde bereits in Grünerator Collaborate exportiert.</p>
              <div className="url-container">
                <input type="text" value={padURL} readOnly className="url-input" />
                <button onClick={handleCopyCollaborateLink} className="copy-collaborate-link-button">
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
      </div>,
      document.body
    );
  };

  return (
    <>
      <button
        onClick={handleExport}
        className="action-button"
        aria-label="Als Dokument exportieren"
        {...props}
      >
        <IoDocumentOutline size={16} />
      </button>
      {isModalOpen && <Modal />}
    </>
  );
};

ExportToDocument.propTypes = {
  content: PropTypes.string.isRequired,
};

export default ExportToDocument;
