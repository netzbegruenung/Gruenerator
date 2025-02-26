import React, { useState, useContext } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import useApiSubmit from '../hooks/useApiSubmit';
import { IoDocumentOutline, IoCopyOutline, IoOpenOutline, IoCloseOutline, IoPeopleOutline, IoFlashOutline, IoLinkOutline, IoCheckmark } from "react-icons/io5";
import '../../assets/styles/components/exportToDocument.css';
import { useLocation } from 'react-router-dom';
import { useUnmount } from 'react-use';
import { FormContext } from '../utils/FormContext';
import { formatExportContent } from '../utils/exportUtils';

const ExportToDocument = ({ content: initialContent }) => {
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [docURL, setDocURL] = useState('');
  const [hasExistingDoc, setHasExistingDoc] = useState(false);
  const { submitForm, loading, error } = useApiSubmit('etherpad/create');
  const { value } = useContext(FormContext);
  const [isCopied, setIsCopied] = useState(false);

  // Verwende den aktuellen Wert aus dem Context oder den initial Content
  const currentContent = value || initialContent;

  // Cleanup beim Unmount (Seitenwechsel, Neuladen, etc.)
  useUnmount(() => {
    setHasExistingDoc(false);
    setDocURL('');
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
    if (docURL) {
      setHasExistingDoc(true);
    }
    setIsModalOpen(true);
  };

  const handleDocsExport = async () => {
    try {
      // Formatiere den HTML-Content
      const htmlContent = formatExportContent({
        analysis: value ? value : currentContent
      });
      
      const response = await submitForm({ 
        text: htmlContent,
        documentType: documentType
      });
      
      if (response && response.padURL) {
        setDocURL(response.padURL);
      } else {
        throw new Error('Keine gültige Docs-URL erhalten');
      }
    } catch (err) {
      console.error('Fehler beim Exportieren zu Grünerator Docs:', err);
    }
  };

  const handleNewExport = async () => {
    setHasExistingDoc(false);
    setDocURL('');
    await handleDocsExport();
  };

  const handleCopyDocsLink = () => {
    navigator.clipboard.writeText(docURL).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }).catch(err => {
      console.error('Fehler beim Kopieren des Docs-Links:', err);
    });
  };

  const handleOpenLink = () => {
    window.open(docURL, '_blank');
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
          <h2 id="export-modal-title">Mit Grünerator Docs freigeben</h2>
          {hasExistingDoc ? (
            <>
              <p>Für {documentType === 'Antrag' || documentType === 'Social Media Post' ? 'diesen' : 'diese'} {documentType} existiert bereits ein Link zur gemeinsamen Bearbeitung:</p>
              <div className="url-container">
                <input type="text" value={docURL} readOnly className="url-input" />
                <button 
                  onClick={handleCopyDocsLink} 
                  className={`copy-docs-link-button ${isCopied ? 'copied' : ''}`}
                >
                  {isCopied ? <IoCheckmark size={20} /> : <IoCopyOutline size={20} />}
                </button>
              </div>
              <div className="button-group">
                <button onClick={handleOpenLink} className="open-button">
                  <IoOpenOutline size={20} /> Bestehendes Dokument öffnen
                </button>
                <button onClick={handleNewExport} className="export-action-button">
                  <IoDocumentOutline size={20} /> Als neues Dokument exportieren
                </button>
              </div>
            </>
          ) : (
            <>
              {!docURL ? (
                <>
                  <p>Möchtest du {documentType === 'Antrag' || documentType === 'Social Media Post' ? 'diesen' : 'diese'} {documentType} mit anderen gemeinsam bearbeiten?</p>
                  <div className="explanation-box">
                    <p>Mit Grünerator Docs kannst du:</p>
                    <ul>
                      <li>
                        <IoPeopleOutline size={18} />
                        <span>Texte in Echtzeit gemeinsam bearbeiten</span>
                      </li>
                      <li>
                        <IoFlashOutline size={18} />
                        <span>Änderungen sofort für alle sichtbar machen</span>
                      </li>
                      <li>
                        <IoLinkOutline size={18} />
                        <span>Einfach per Link zusammenarbeiten</span>
                      </li>
                    </ul>
                    <div className="info-note">
                      <p>Hinweis: Der Link ist öffentlich, enthält aber einen Sicherheitsschlüssel und ist schwer zu erraten. Teile ihn dennoch nur mit Personen, denen du vertraust.</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleDocsExport} 
                    disabled={loading}
                    className="export-action-button"
                  >
                    {loading ? 'Wird exportiert...' : 'Jetzt freigeben'}
                  </button>
                </>
              ) : (
                <>
                  <p>{documentType === 'Antrag' || documentType === 'Social Media Post' ? 'Dein' : 'Deine'} {documentType} wurde erfolgreich freigegeben. Hier ist dein Link:</p>
                  <div className="url-container">
                    <input type="text" value={docURL} readOnly className="url-input" />
                    <button 
                      onClick={handleCopyDocsLink} 
                      className={`copy-docs-link-button ${isCopied ? 'copied' : ''}`}
                    >
                      {isCopied ? <IoCheckmark size={20} /> : <IoCopyOutline size={20} />}
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
        data-tooltip-id="action-tooltip"
        data-tooltip-content="Docs Export"
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