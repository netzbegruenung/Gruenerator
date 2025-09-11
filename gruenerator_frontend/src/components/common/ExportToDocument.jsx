import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import useApiSubmit from '../hooks/useApiSubmit';
import '../../assets/styles/components/actions/exportToDocument.css';
import { IoDocumentOutline, IoCopyOutline, IoOpenOutline, IoCloseOutline, IoPeopleOutline, IoFlashOutline, IoLinkOutline, IoCheckmark, IoDownloadOutline } from "react-icons/io5";
import { useLocation } from 'react-router-dom';
import { useUnmount } from 'react-use';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { extractPlainText } from '../utils/contentExtractor';

const ExportToDocument = () => {
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [docURL, setDocURL] = useState('');
  const [hasExistingDoc, setHasExistingDoc] = useState(false);
  const { submitForm, loading, error } = useApiSubmit('etherpad/create');
  const { getGeneratedText } = useGeneratedTextStore();
  const [isCopied, setIsCopied] = useState(false);
  const [contentCopied, setContentCopied] = useState(false);

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

  // Funktion zur Bestimmung des Komponentennamens basierend auf der Route
  const getComponentName = () => {
    const path = location.pathname;
    
    // Accurate mapping from routes to actual component names used by generators
    if (path.includes('pressemitteilung') || path.includes('social')) return 'presse-social';
    if (path.includes('antrag')) return 'antrag-generator';
    if (path.includes('universal') || path.includes('rede') || path.includes('wahlprogramm')) return 'universal-text';
    if (path.includes('gruene-jugend')) return 'gruene-jugend';
    if (path.includes('ask-grundsatz')) return 'ask-grundsatz';
    if (path.includes('ask')) return 'ask';
    
    // Fallback - extract from pathname and try common patterns
    const pathParts = path.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || 'default';
    
    // Try common generator patterns
    if (lastPart.includes('text')) return 'universal-text';
    if (lastPart.includes('generator')) return lastPart;
    
    return lastPart;
  };

  // Fallback-Funktion für alternative Komponentennamen
  const tryGetTextWithFallbacks = (primaryComponentName) => {
    // Try primary component name first
    let text = getGeneratedText(primaryComponentName);
    if (text) return { text, componentName: primaryComponentName };
    
    // Define fallback patterns based on route
    const path = location.pathname;
    const fallbacks = [];
    
    if (path.includes('social') || path.includes('pressemitteilung')) {
      fallbacks.push('presse-social', 'social', 'pressemitteilung');
    } else if (path.includes('antrag')) {
      fallbacks.push('antrag-generator', 'antrag');
    } else if (path.includes('universal') || path.includes('rede') || path.includes('wahlprogramm')) {
      fallbacks.push('universal-text', 'universal', 'rede', 'wahlprogramm');
    } else if (path.includes('gruene-jugend')) {
      fallbacks.push('gruene-jugend', 'gruene_jugend');
    } else if (path.includes('ask')) {
      fallbacks.push('ask', 'ask-grundsatz');
    }
    
    // Try fallbacks
    for (const fallback of fallbacks) {
      text = getGeneratedText(fallback);
      if (text) return { text, componentName: fallback };
    }
    
    // Try common generic names as last resort
    const genericFallbacks = ['default', 'main', 'content'];
    for (const fallback of genericFallbacks) {
      text = getGeneratedText(fallback);
      if (text) return { text, componentName: fallback };
    }
    
    return { text: null, componentName: primaryComponentName };
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
      // Get the appropriate component name and retrieve generated text with fallbacks
      const primaryComponentName = getComponentName();
      const { text: generatedText, componentName: actualComponentName } = tryGetTextWithFallbacks(primaryComponentName);
      
      // Enhanced debug logging
      if (process.env.NODE_ENV === 'development') {
        console.log('Export debug:', {
          route: location.pathname,
          primaryComponentName,
          actualComponentName,
          hasText: !!generatedText,
          textType: typeof generatedText,
          textLength: typeof generatedText === 'string' ? generatedText.length : 'object'
        });
      }
      
      // Check if we have text to export
      if (!generatedText) {
        const helpfulError = `Kein Text zum Exportieren verfügbar. 
        
Bitte generiere erst einen Text auf dieser Seite.

Debug Info:
- Aktuelle Route: ${location.pathname}
- Erwarteter Komponenten-Name: ${primaryComponentName}
- Geprüfte Alternativen: ${actualComponentName !== primaryComponentName ? actualComponentName : 'keine'}`;
        
        throw new Error(helpfulError);
      }
      
      // Use centralized content extractor to produce plain text for ep_post_data
      const plainContent = await extractPlainText(generatedText);
      
      // Final check that we have content after extraction
      if (!plainContent || plainContent.trim().length === 0) {
        throw new Error(`Der extrahierte Text ist leer. 
        
Gefundener Text-Typ: ${typeof generatedText}
Komponenten-Name: ${actualComponentName}

Bitte überprüfe den generierten Text oder kontaktiere den Support.`);
      }
      
      // Log successful extraction
      if (process.env.NODE_ENV === 'development') {
        console.log('Export successful:', {
          actualComponentName,
          plainContentLength: plainContent.length,
          documentType
        });
      }
      
      const response = await submitForm({ 
        text: plainContent,
        documentType: documentType
      });
      
      if (response && response.padURL) {
        setDocURL(response.padURL);
        try {
          await navigator.clipboard.writeText(plainContent);
          setContentCopied(true);
        } catch (copyErr) {
          console.warn('Clipboard copy failed:', copyErr);
          setContentCopied(false);
        }
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
                  <p>{documentType === 'Antrag' || documentType === 'Social Media Post' ? 'Dein' : 'Deine'} {documentType} wurde erfolgreich freigegeben.</p>
                  {contentCopied ? (
                    <p>Der Text wurde in die Zwischenablage kopiert. Öffne das Dokument und füge ihn dort mit <strong>Strg+V</strong> ein.</p>
                  ) : (
                    <p>Öffne das Dokument und füge deinen Text dort ein.</p>
                  )}
                  <p>Hier ist dein Link:</p>
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

ExportToDocument.propTypes = {};

export default ExportToDocument;