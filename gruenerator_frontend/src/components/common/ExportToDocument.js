import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import useApiSubmit from '../hooks/useApiSubmit';
import { IoDocumentOutline, IoCopyOutline, IoOpenOutline, IoCloseOutline } from "react-icons/io5";
import '../../assets/styles/components/exportToDocument.css';
import { useLocation } from 'react-router-dom';
import { useUnmount } from 'react-use';

const ExportToDocument = ({ content, ...props }) => {
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [padURL, setPadURL] = useState('');
  const [hasExistingPad, setHasExistingPad] = useState(false);
  const { submitForm, loading, error } = useApiSubmit('etherpad/create');

  // Cleanup beim Unmount (Seitenwechsel, Neuladen, etc.)
  useUnmount(() => {
    setHasExistingPad(false);
    setPadURL('');
  });

  // Funktion zur Bestimmung des Dokumenttyps basierend auf der Route
  const getDocumentType = () => {
    const path = location.pathname;
    if (path.includes('pressemitteilung')) return 'Pressemitteilung';
    if (path.includes('antrag')) return 'Antrag';
    if (path.includes('anfrage')) return 'Anfrage';
    if (path.includes('social')) return 'Social Media Post';
    if (path.includes('rede')) return 'Rede';
    return 'Dokument'; // Fallback
  };

  // Generiere einen eindeutigen Storage-Key basierend auf Pathname und Dokumenttyp
  const documentType = getDocumentType();

  // Beim Öffnen des Modals prüfen wir den Status neu
  const handleExport = () => {
    if (padURL) {
      setHasExistingPad(true);
    }
    setIsModalOpen(true);
  };

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
    try {
      const cleanContent = cleanHtmlContent(content);
      const response = await submitForm({ 
        text: cleanContent,
        documentType: documentType
      });
      
      if (response && response.padURL) {
        setPadURL(response.padURL);
      } else {
        throw new Error('Keine gültige Pad-URL erhalten');
      }
    } catch (err) {
      console.error('Fehler beim Exportieren zu Grünerator Office:', err);
    }
  };

  const handleCopyCollaborateLink = () => {
    navigator.clipboard.writeText(padURL).then(() => {
      alert('Office-Link wurde in deine Zwischenablage kopiert!');
    }).catch(err => {
      console.error('Fehler beim Kopieren des Office-Links:', err);
    });
  };

  const handleOpenLink = () => {
    window.open(padURL, '_blank');
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
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
          {hasExistingPad ? (
            <>
              <p>Für diese {documentType} existiert bereits ein Collaborate-Link:</p>
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
            <>
              {!padURL ? (
                <>
                  <p>Möchtest du diese {documentType} in Grünerator Collaborate exportieren?</p>
                  <p>Grünerator Collaborate ermöglicht die gemeinsame Textbearbeitung in Echtzeit. Mehrere Personen können gleichzeitig an einem Dokument arbeiten. Änderungen sind sofort für alle sichtbar, und das Dokument ist einfach über einen Link zugänglich. Perfekt für Brainstorming, gemeinsames Schreiben oder schnelle Zusammenarbeit an Texten.</p>
                  <button 
                    onClick={handleEtherpadExport} 
                    disabled={loading}
                    className="export-action-button"
                  >
                    {loading ? 'Wird exportiert...' : `${documentType} zu Grünerator Collaborate exportieren`}
                  </button>
                </>
              ) : (
                <>
                  <p>Deine {documentType} wurde erfolgreich exportiert. Hier ist dein Collaborate-Link:</p>
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
