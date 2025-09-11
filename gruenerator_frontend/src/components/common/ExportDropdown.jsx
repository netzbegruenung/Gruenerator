import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { IoDownloadOutline, IoShareSocialSharp, IoCloudUploadOutline, IoCheckmarkOutline } from "react-icons/io5";
import { FaCloud } from "react-icons/fa";
import { FaFileWord } from "react-icons/fa6";
import { CiMemoPad } from "react-icons/ci";
import { HiRefresh, HiSave, HiCog } from "react-icons/hi";
import { useExportStore } from '../../stores/core/exportStore';
import { useLazyAuth } from '../../hooks/useAuth';
import useApiSubmit from '../hooks/useApiSubmit';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { extractPlainText, extractFormattedText } from '../utils/contentExtractor';
import { NextcloudShareManager } from '../../utils/nextcloudShareManager';
import WolkeSetupModal from '../../features/wolke/components/WolkeSetupModal';
import { useLocation } from 'react-router-dom';
import apiClient from '../utils/apiClient';

const ExportDropdown = ({ content, title, className = 'action-button', onSaveToLibrary, saveToLibraryLoading }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [shareLinks, setShareLinks] = useState([]);
  const [selectedShareLinkId, setSelectedShareLinkId] = useState('');
  const [loadingShareLinks, setLoadingShareLinks] = useState(false);
  const [uploadingToWolke, setUploadingToWolke] = useState(false);
  const [saveIcon, setSaveIcon] = useState('save');
  const [showWolkeSubDropdown, setShowWolkeSubDropdown] = useState(false);
  const [exportIcon, setExportIcon] = useState('share');
  const [showWolkeSetupModal, setShowWolkeSetupModal] = useState(false);
  
  const { isAuthenticated } = useLazyAuth();
  const location = useLocation();
  const { submitForm, loading: docsLoading } = useApiSubmit('etherpad/create');
  const { getGeneratedText } = useGeneratedTextStore();
  
  const { isGenerating, generateDOCX } = useExportStore();

  const isMobileView = window.innerWidth <= 768;

  // Local modal state for copy/paste instruction
  const [showPastePopup, setShowPastePopup] = useState(false);
  const [copySucceeded, setCopySucceeded] = useState(false);
  const [padURL, setPadURL] = useState('');

  // Load share links when dropdown opens
  const loadShareLinks = useCallback(async () => {
    if (!isAuthenticated) return;
    
    setLoadingShareLinks(true);
    try {
      const links = await NextcloudShareManager.getShareLinks();
      const activeLinks = links.filter(link => link.is_active);
      setShareLinks(activeLinks);
      if (activeLinks.length > 0 && !selectedShareLinkId) {
        setSelectedShareLinkId(activeLinks[0].id);
      }
    } catch (error) {
      console.error('Failed to load share links:', error);
      setShareLinks([]);
    } finally {
      setLoadingShareLinks(false);
    }
  }, [isAuthenticated, selectedShareLinkId]);

  const handleDropdownClick = () => {
    setShowDropdown(!showDropdown);
    if (!showDropdown && isAuthenticated) {
      loadShareLinks();
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showDropdown && !event.target.closest('.export-dropdown')) {
        setShowDropdown(false);
        setShowWolkeSubDropdown(false);
      }
      if (showWolkeSubDropdown && !event.target.closest('.wolke-subdropdown') && !event.target.closest('.wolke-trigger')) {
        setShowWolkeSubDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown, showWolkeSubDropdown]);

  // Helper functions from ExportToDocument
  const getDocumentType = () => {
    const path = location.pathname;
    if (path.includes('pressemitteilung')) return 'Pressemitteilung';
    if (path.includes('antrag')) return 'Antrag';
    if (path.includes('anfrage')) return 'Anfrage';
    if (path.includes('social')) return 'Social Media Post';
    if (path.includes('rede')) return 'Rede';
    return 'Dokument';
  };

  const getComponentName = () => {
    const path = location.pathname;
    if (path.includes('pressemitteilung') || path.includes('social')) return 'presse-social';
    if (path.includes('antrag')) return 'antrag-generator';
    if (path.includes('universal') || path.includes('rede') || path.includes('wahlprogramm')) return 'universal-text';
    if (path.includes('gruene-jugend')) return 'gruene-jugend';
    if (path.includes('ask-grundsatz')) return 'ask-grundsatz';
    if (path.includes('ask')) return 'ask';
    
    const pathParts = path.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || 'default';
    
    if (lastPart.includes('text')) return 'universal-text';
    if (lastPart.includes('generator')) return lastPart;
    
    return lastPart;
  };

  const tryGetTextWithFallbacks = (primaryComponentName) => {
    let text = getGeneratedText(primaryComponentName);
    if (text) return { text, componentName: primaryComponentName };
    
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
    
    for (const fallback of fallbacks) {
      text = getGeneratedText(fallback);
      if (text) return { text, componentName: fallback };
    }
    
    const genericFallbacks = ['default', 'main', 'content'];
    for (const fallback of genericFallbacks) {
      text = getGeneratedText(fallback);
      if (text) return { text, componentName: fallback };
    }
    
    return { text: null, componentName: primaryComponentName };
  };

  const handleDocsExport = async () => {
    setShowDropdown(false);
    try {
      const primaryComponentName = getComponentName();
      const { text: generatedText } = tryGetTextWithFallbacks(primaryComponentName);
      
      if (!generatedText) {
        alert('Kein Text zum Exportieren verfügbar. Bitte generiere erst einen Text auf dieser Seite.');
        return;
      }
      
      const plainContent = await extractPlainText(generatedText);
      if (!plainContent || plainContent.trim().length === 0) {
        
        alert('Der extrahierte Text ist leer.');
        return;
      }
      
      const response = await submitForm({ 
        text: plainContent,
        documentType: getDocumentType()
      });

      // Copy content to clipboard so user can paste into pad
      try {
        await navigator.clipboard.writeText(plainContent);
        setCopySucceeded(true);
      } catch (copyErr) {
        console.warn('Clipboard copy failed:', copyErr);
        setCopySucceeded(false);
      } finally {
        setShowPastePopup(true);
      }
      
      if (response && response.padURL) {
        setPadURL(response.padURL);
      }
    } catch (err) {
      console.error('Fehler beim Exportieren zu Docs:', err);
      alert('Fehler beim Exportieren zu Docs: ' + err.message);
    }
  };

  const handleDOCXDownload = useCallback(async () => {
    setShowDropdown(false);
    try {
      const formattedContent = await extractFormattedText(content);
      await generateDOCX(formattedContent, title);
    } catch (error) {
      console.error('DOCX download failed:', error);
      alert('DOCX Download fehlgeschlagen: ' + error.message);
    }
  }, [generateDOCX, content, title]);

  const handleWolkeClick = async () => {
    if (!isAuthenticated) return;
    
    // Load sharelinks if not already loaded
    if (shareLinks.length === 0 && !loadingShareLinks) {
      await loadShareLinks();
    }
    
    // If only one sharelink, upload directly
    if (shareLinks.length === 1) {
      await handleWolkeUpload(shareLinks[0].id);
    } else if (shareLinks.length > 1) {
      // Show sub-dropdown for multiple sharelinks
      setShowWolkeSubDropdown(true);
    } else {
      // Show setup modal for configuring first Wolke connection
      setShowWolkeSetupModal(true);
    }
  };

  const handleWolkeUpload = async (shareLinkId) => {
    setShowDropdown(false);
    setShowWolkeSubDropdown(false);
    setUploadingToWolke(true);
    
    try {
      const { extractFilenameFromContent } = await import('../utils/titleExtractor');
      const formattedContent = await extractFormattedText(content);
      const baseFileName = extractFilenameFromContent(formattedContent, title);
      const filename = `${baseFileName}.docx`;

      // Request backend to generate DOCX blob
      const response = await apiClient.post('/exports/docx', { 
        content: formattedContent, 
        title 
      }, {
        responseType: 'blob'
      });
      const blob = response.data;

      // Convert blob to base64 for upload
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Content = reader.result.split(',')[1]; // Remove data:application/vnd...;base64, prefix
        
        const result = await NextcloudShareManager.upload(shareLinkId, base64Content, filename);
        
        if (result.success) {
          // Show checkmark icon instead of alert
          setExportIcon('checkmark');
          setTimeout(() => {
            setExportIcon('share');
          }, 2000);
        } else {
          alert('Upload zu Wolke fehlgeschlagen: ' + result.message);
        }
        setUploadingToWolke(false);
      };
      
      reader.onerror = () => {
        alert('Fehler beim Konvertieren der DOCX-Datei');
        setUploadingToWolke(false);
      };
      
      reader.readAsDataURL(blob);
      
    } catch (error) {
      console.error('Wolke upload failed:', error);
      alert('Wolke Upload fehlgeschlagen: ' + error.message);
      setUploadingToWolke(false);
    }
  };

  const handleSaveToLibrary = () => {
    setShowDropdown(false);
    if (onSaveToLibrary) {
      onSaveToLibrary();
      // Show checkmark after save attempt
      setSaveIcon('checkmark');
      setTimeout(() => {
        setSaveIcon('save');
      }, 2000);
    }
  };

  const handleWolkeSetup = async (shareLink, label) => {
    try {
      const parsed = NextcloudShareManager.parseShareLink(shareLink);
      if (!parsed) throw new Error('Ungültiger Wolke-Share-Link');
      await NextcloudShareManager.saveShareLink(shareLink, label, parsed.baseUrl, parsed.shareToken);
      // Reload share links after successful setup
      await loadShareLinks();
      // Close modal and proceed with upload if we now have links
      setShowWolkeSetupModal(false);
      
      // Small delay to ensure state updates, then retry the upload
      setTimeout(() => {
        handleWolkeClick();
      }, 100);
    } catch (error) {
      // Error will be handled by the modal component
      throw error;
    }
  };

  if (!content) {
    return null;
  }

  const isLoading = isGenerating || docsLoading || uploadingToWolke || saveToLibraryLoading;

  return (
    <div className="export-dropdown download-export">
      <button
        className={className}
        onClick={handleDropdownClick}
        disabled={isLoading}
        aria-label="Teilen"
        {...(!isMobileView && {
          'data-tooltip-id': "action-tooltip",
          'data-tooltip-content': "Teilen"
        })}
      >
        {isLoading ? (
          <HiRefresh className="spinning" size={16} />
        ) : exportIcon === 'checkmark' ? (
          <IoCheckmarkOutline size={16} />
        ) : (
          <IoShareSocialSharp size={16} />
        )}
      </button>

      {showDropdown && (
        <div className="format-dropdown">
          <button
            className="format-option"
            onClick={handleDocsExport}
            disabled={docsLoading}
          >
            <CiMemoPad size={16} />
            <div className="format-option-content">
              <div className="format-option-title">
                {docsLoading ? 'Exportiere...' : 'Docs Export'}
              </div>
              <div className="format-option-subtitle">
                Öffentlich verfügbar, als Link teilbar
              </div>
            </div>
          </button>
          
          <button
            className="format-option"
            onClick={handleDOCXDownload}
            disabled={isGenerating}
          >
            <FaFileWord size={16} />
            <div className="format-option-content">
              <div className="format-option-title">
            {isGenerating ? (
              <>
                <HiRefresh className="spinning" size={14} style={{ marginRight: '6px' }} />
                Wird erstellt...
              </>
            ) : 'Datei herunterladen'}
              </div>
              <div className="format-option-subtitle">
                Für Word und LibreOffice
              </div>
            </div>
          </button>
          
          {isAuthenticated && onSaveToLibrary && (
            <>
              <div className="format-divider"></div>
              <button
                className="format-option"
                onClick={handleSaveToLibrary}
                disabled={saveToLibraryLoading}
              >
                {saveIcon === 'checkmark' ? (
                  <IoCheckmarkOutline size={12} />
                ) : (
                  <HiCog size={12} />
                )}
                <div className="format-option-content">
                  <div className="format-option-title">
                    {saveToLibraryLoading ? 'Speichere...' : 'Im Grünerator speichern'}
                  </div>
                  <div className="format-option-subtitle">
                    Für später wiederverwenden
                  </div>
                </div>
              </button>
            </>
          )}
          
          {isAuthenticated && (
            <button
              className="format-option wolke-trigger"
              onClick={handleWolkeClick}
              disabled={uploadingToWolke || loadingShareLinks}
            >
              <FaCloud size={16} />
              <div className="format-option-content">
                <div className="format-option-title">
                  {uploadingToWolke ? 'Uploade...' : loadingShareLinks ? 'Lade...' : 'Wolke Export'}
                </div>
                <div className="format-option-subtitle">
                  In der Grünen Wolke speichern
                </div>
              </div>
              {uploadingToWolke && <HiRefresh className="spinning" size={14} />}
            </button>
          )}
        </div>
      )}

      {/* Wolke Sub-Dropdown */}
      {showWolkeSubDropdown && shareLinks.length > 1 && (
        <div className="wolke-subdropdown">
          <div className="wolke-subdropdown-header">
            <span>Wolke-Verbindung wählen:</span>
          </div>
          {shareLinks.map(link => (
            <button
              key={link.id}
              className="wolke-subdropdown-option"
              onClick={() => handleWolkeUpload(link.id)}
              disabled={uploadingToWolke}
            >
              <FaCloud size={14} />
              <div className="wolke-subdropdown-content">
                <div className="wolke-subdropdown-title">
                  {link.label || 'Unbenannte Wolke'}
                </div>
                <div className="wolke-subdropdown-subtitle">
                  {new URL(link.share_link).hostname}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Wolke Setup Modal */}
      {showWolkeSetupModal && (
        <WolkeSetupModal
          onClose={() => setShowWolkeSetupModal(false)}
          onSubmit={handleWolkeSetup}
        />
      )}

      {/* Paste Instruction Popup using existing modal structure */}
      {showPastePopup && (
        <div className="modal" role="dialog" aria-labelledby="paste-instruction-title" onClick={() => setShowPastePopup(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 id="paste-instruction-title">Text in Docs einfügen</h2>
            <p>
              {copySucceeded
                ? 'Der Text wurde in die Zwischenablage kopiert. Öffne das Docs-Dokument und füge ihn mit Strg+V ein.'
                : 'Öffne das Docs-Dokument und füge den Text dort ein.'}
            </p>
            {padURL && (
              <div className="url-container" style={{ marginTop: 'var(--spacing-small)' }}>
                <input type="text" value={padURL} readOnly className="url-input" />
              </div>
            )}
            <div className="button-group">
              <button 
                onClick={() => { if (padURL) { window.open(padURL, '_blank'); } setShowPastePopup(false); }} 
                className="open-button"
              >
                Link öffnen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

ExportDropdown.propTypes = {
  content: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
  title: PropTypes.string,
  className: PropTypes.string,
  onSaveToLibrary: PropTypes.func,
  saveToLibraryLoading: PropTypes.bool
};

export default ExportDropdown;
