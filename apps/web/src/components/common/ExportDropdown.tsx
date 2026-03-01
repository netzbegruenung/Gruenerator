import { useAgentStore } from '@gruenerator/chat';
import { type JSX, useState, useCallback, useEffect, type ReactNode } from 'react';
import { CiMemoPad } from 'react-icons/ci';
import { FaCloud } from 'react-icons/fa';
import { FaFileWord, FaFilePdf } from 'react-icons/fa6';
import { HiRefresh, HiSave, HiOutlineDocumentText } from 'react-icons/hi';
import {
  IoDownloadOutline,
  IoShareSocialSharp,
  IoEllipsisVertical,
  IoCheckmarkOutline,
  IoCloseOutline,
  IoCopyOutline,
  IoOpenOutline,
  IoChatbubbleOutline,
} from 'react-icons/io5';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '../../components/ui/dropdown-menu';
import WolkeSetupModal from '../../features/wolke/components/WolkeSetupModal';
import { useLazyAuth } from '../../hooks/useAuth';
import { useBetaFeatures } from '../../hooks/useBetaFeatures';
import { awaitDeferredTitle } from '../../hooks/useDeferredTitle';
import { useExportStore } from '../../stores/core/exportStore';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { NextcloudShareManager, type ShareLink } from '../../utils/nextcloudShareManager';
import { canShare, shareContent } from '../../utils/shareUtils';
import useApiSubmit from '../hooks/useApiSubmit';
import apiClient from '../utils/apiClient';
import { copyFormattedContent } from '../utils/commonFunctions';
import {
  extractPlainText as extractPlainTextJs,
  extractFormattedText as extractFormattedTextJs,
} from '../utils/contentExtractor';

import type { ContentMetadata } from '@/types/baseform';

// Type assertions for JS functions that return Promises
const extractPlainText = extractPlainTextJs as unknown as (content: unknown) => Promise<string>;
const extractFormattedText = extractFormattedTextJs as unknown as (
  content: unknown
) => Promise<string>;
import '../../assets/styles/components/actions/exportToDocument.css';

interface ExportDropdownProps {
  content: string;
  title?: string;
  className?: string;
  onSaveToLibrary?: (() => void) | null;
  saveToLibraryLoading?: boolean;
  customExportOptions?: {
    id?: string;
    label?: string;
    subtitle?: string;
    icon?: ReactNode;
    onClick: (event: React.MouseEvent) => void;
    disabled?: boolean;
  }[];
  hideDefaultOptions?: boolean;
  showShareButton?: boolean;
  showMoreMenu?: boolean;
  onEditInDocs?: () => void;
  editInDocsLoading?: boolean;
  onEditInDocsInline?: () => void;
  editInDocsInlineLoading?: boolean;
}

const ExportDropdown = ({
  content,
  title,
  className = 'action-button',
  onSaveToLibrary,
  saveToLibraryLoading,
  customExportOptions = [],
  hideDefaultOptions = false,
  showShareButton = true,
  showMoreMenu = true,
  onEditInDocs,
  editInDocsLoading = false,
  onEditInDocsInline,
  editInDocsInlineLoading = false,
}: ExportDropdownProps): JSX.Element | null => {
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [selectedShareLinkId, setSelectedShareLinkId] = useState<string>('');
  const [loadingShareLinks, setLoadingShareLinks] = useState<boolean>(false);
  const [uploadingToWolke, setUploadingToWolke] = useState<boolean>(false);
  const [saveIcon, setSaveIcon] = useState<string>('save');
  const [exportIcon, setExportIcon] = useState<string>('share');
  const [textCopyIcon, setTextCopyIcon] = useState<ReactNode>(<IoCopyOutline size={20} />);
  const [showWolkeSetupModal, setShowWolkeSetupModal] = useState<boolean>(false);
  const [canNativeShare, setCanNativeShare] = useState<boolean>(false);
  const [showPastePopup, setShowPastePopup] = useState<boolean>(false);
  const [copySucceeded, setCopySucceeded] = useState<boolean>(false);
  const [padURL, setPadURL] = useState<string>('');
  const [urlCopied, setUrlCopied] = useState<boolean>(false);

  const { isAuthenticated } = useLazyAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { getBetaFeatureState } = useBetaFeatures();
  const hasChatAccess = isAuthenticated;
  const hasDocsAccess = isAuthenticated && getBetaFeatureState('docs');
  const { submitForm: submitEtherpad, loading: etherpadLoading } = useApiSubmit('etherpad/create');
  const getGeneratedText = useGeneratedTextStore((state) => state.getGeneratedText);

  const { isGenerating, generateDOCX, generatePDF } = useExportStore();

  const isMobileView = window.innerWidth <= 768;

  // Load share links when dropdown opens
  const loadShareLinks = useCallback(async () => {
    if (!isAuthenticated) return;

    setLoadingShareLinks(true);
    try {
      const links = await NextcloudShareManager.getShareLinks();
      const activeLinks = links.filter((link) => link.is_active);
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

  // Check native share capability on mount
  useEffect(() => {
    setCanNativeShare(canShare());
  }, []);

  // Helper functions for document type and component name detection
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
    if (path.includes('universal') || path.includes('rede') || path.includes('wahlprogramm'))
      return 'universal-text';
    if (path.includes('gruene-jugend')) return 'gruene-jugend';
    if (path.includes('gruene-notebook')) return 'ask-grundsatz';
    if (path.includes('ask')) return 'ask';

    const pathParts = path.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || 'default';

    if (lastPart.includes('text')) return 'universal-text';
    if (lastPart.includes('generator')) return lastPart;

    return lastPart;
  };

  const getFreshTitle = async (): Promise<string> => {
    const cn = getComponentName();
    await awaitDeferredTitle(cn);
    const meta = useGeneratedTextStore
      .getState()
      .getGeneratedTextMetadata(cn) as ContentMetadata | null;
    return meta?.title || title || '';
  };

  const tryGetTextWithFallbacks = (primaryComponentName: string) => {
    let text = getGeneratedText(primaryComponentName);
    if (text) return { text, componentName: primaryComponentName };

    const path = location.pathname;
    const fallbacks = [];

    if (path.includes('social') || path.includes('pressemitteilung')) {
      fallbacks.push('presse-social', 'social', 'pressemitteilung');
    } else if (path.includes('antrag')) {
      fallbacks.push('antrag-generator', 'antrag');
    } else if (
      path.includes('universal') ||
      path.includes('rede') ||
      path.includes('wahlprogramm')
    ) {
      fallbacks.push('universal-text', 'universal', 'rede', 'wahlprogramm');
    } else if (path.includes('gruene-jugend')) {
      fallbacks.push('gruene-jugend', 'gruene_jugend');
    } else if (path.includes('gruene-notebook')) {
      fallbacks.push('ask-grundsatz', 'ask');
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

  const handleEditInDocsClick = () => {
    onEditInDocs?.();
  };

  /* Inline editor handler — disabled for now
  const handleEditInDocsInlineClick = () => {
    onEditInDocsInline?.();
  };
  */

  const handleEtherpadExport = async () => {
    try {
      if (!content) {
        alert('Kein Text zum Exportieren verfügbar.');
        return;
      }
      const plainContent = await extractPlainText(content);
      if (!plainContent || plainContent.trim().length === 0) {
        alert('Der extrahierte Text ist leer.');
        return;
      }
      const response = await submitEtherpad({
        text: plainContent,
        documentType: getDocumentType(),
      });
      try {
        await navigator.clipboard.writeText(plainContent);
        setCopySucceeded(true);
      } catch {
        setCopySucceeded(false);
      } finally {
        setShowPastePopup(true);
      }
      if (response && typeof response.padURL === 'string') {
        setPadURL(response.padURL);
      }
    } catch (err) {
      console.error('Fehler beim Exportieren zu Textbegrünung:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      alert('Fehler beim Exportieren zu Textbegrünung: ' + errorMessage);
    }
  };

  const handleCopyText = async () => {
    await copyFormattedContent(
      content,
      () => {
        setTextCopyIcon(<IoCheckmarkOutline size={20} />);
        setTimeout(() => {
          setTextCopyIcon(<IoCopyOutline size={20} />);
        }, 2000);
      },
      () => {}
    );
  };

  const handleNativeShare = async () => {
    try {
      const plainContent = await extractPlainText(content);
      if (!plainContent || plainContent.trim().length === 0) {
        alert('Kein Text zum Teilen verfügbar.');
        return;
      }

      const freshTitle = await getFreshTitle();
      await shareContent({
        title: freshTitle || 'Grünerator Text',
        text: plainContent,
      });
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Share failed:', error);
      }
    }
  };

  const handleDOCXDownload = useCallback(async () => {
    try {
      const freshTitle = await getFreshTitle();
      const formattedContent = await extractFormattedText(content);
      await generateDOCX(formattedContent, freshTitle);
    } catch (error) {
      console.error('DOCX download failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert('DOCX Download fehlgeschlagen: ' + errorMessage);
    }
  }, [generateDOCX, content, title]);

  const handlePDFDownload = useCallback(async () => {
    try {
      const freshTitle = await getFreshTitle();
      const formattedContent = await extractFormattedText(content);
      await generatePDF(formattedContent, freshTitle);
    } catch (error) {
      console.error('PDF download failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert('PDF Download fehlgeschlagen: ' + errorMessage);
    }
  }, [generatePDF, content, title]);

  const handleWolkeClick = async () => {
    if (!isAuthenticated) return;

    // Load sharelinks if not already loaded
    if (shareLinks.length === 0 && !loadingShareLinks) {
      await loadShareLinks();
    }

    // If only one sharelink, upload directly
    if (shareLinks.length === 1 && shareLinks[0]) {
      await handleWolkeUpload(shareLinks[0].id);
    } else if (shareLinks.length > 1) {
      // TODO: Show sub-menu for multiple sharelinks when Wolke is re-enabled
    } else {
      // Show setup modal for configuring first Wolke connection
      setShowWolkeSetupModal(true);
    }
  };

  const handleWolkeUpload = async (shareLinkId: string) => {
    setUploadingToWolke(true);

    try {
      const freshTitle = await getFreshTitle();
      const { extractFilenameFromContent } = await import('../utils/titleExtractor');
      const formattedContent = await extractFormattedText(content);
      const baseFileName = extractFilenameFromContent(formattedContent, freshTitle);
      const filename = `${baseFileName}.docx`;

      const response = await apiClient.post(
        '/exports/docx',
        {
          content: formattedContent,
          title: freshTitle,
        },
        {
          responseType: 'blob',
        }
      );
      const blob = response.data;

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Content = (reader.result as string).split(',')[1];

        const result = await NextcloudShareManager.upload(shareLinkId, base64Content, filename);

        if (result.success) {
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert('Wolke Upload fehlgeschlagen: ' + errorMessage);
      setUploadingToWolke(false);
    }
  };

  const handleSaveToLibrary = () => {
    if (onSaveToLibrary) {
      onSaveToLibrary();
      // Show checkmark after save attempt
      setSaveIcon('checkmark');
      setTimeout(() => {
        setSaveIcon('save');
      }, 2000);
    }
  };

  const handleDiscussInChat = async () => {
    try {
      const plainContent = await extractPlainText(content);
      if (!plainContent?.trim()) {
        alert('Kein Text zum Besprechen verfügbar.');
        return;
      }
      const freshTitle = await getFreshTitle();
      const titleLine = freshTitle ? `**${freshTitle}**\n\n` : '';
      const reviewMessage = `Bitte überprüfe den folgenden Text und gib mir konstruktives Feedback:\n\n${titleLine}---\n${plainContent}\n---`;

      useAgentStore.getState().setPendingMessage(reviewMessage);
      navigate('/chat');
    } catch (err) {
      console.error('Failed to prepare chat review:', err);
    }
  };

  const handleWolkeSetup = async (shareLink: string, label: string) => {
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
  };

  if (!content) {
    return null;
  }

  const isLoading =
    isGenerating ||
    etherpadLoading ||
    editInDocsLoading ||
    editInDocsInlineLoading ||
    uploadingToWolke ||
    saveToLibraryLoading;

  return (
    <div className="export-dropdown">
      {/* Share button - Direct native share */}
      {showShareButton && canNativeShare && (
        <button
          className={className}
          onClick={handleNativeShare}
          disabled={isLoading}
          aria-label="Teilen"
          {...(!isMobileView && {
            'data-tooltip-id': 'action-tooltip',
            'data-tooltip-content': 'Direkt teilen',
          })}
        >
          <IoShareSocialSharp size={16} />
        </button>
      )}

      {/* More options menu (3-dot) */}
      {showMoreMenu && (
        <DropdownMenu
          onOpenChange={(open) => {
            if (open && isAuthenticated) loadShareLinks();
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              className={className}
              disabled={isLoading}
              aria-label="Weitere Optionen"
              {...(!isMobileView && {
                'data-tooltip-id': 'action-tooltip',
                'data-tooltip-content': 'Weitere Optionen',
              })}
            >
              {isLoading ? (
                <HiRefresh className="spinning" size={16} />
              ) : exportIcon === 'checkmark' ? (
                <IoCheckmarkOutline size={16} />
              ) : (
                <IoEllipsisVertical size={16} />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Custom export options */}
            {customExportOptions.map((option) => (
              <DropdownMenuItem
                key={option.id}
                onSelect={() => option.onClick({} as React.MouseEvent)}
                disabled={option.disabled}
              >
                {option.icon}
                <div className="flex flex-col gap-0.5">
                  <span>{option.label}</span>
                  {option.subtitle && <span className="text-xs opacity-70">{option.subtitle}</span>}
                </div>
              </DropdownMenuItem>
            ))}

            {customExportOptions.length > 0 && !hideDefaultOptions && <DropdownMenuSeparator />}

            {!hideDefaultOptions && (
              <>
                {onEditInDocs && hasDocsAccess && (
                  <DropdownMenuItem onSelect={handleEditInDocsClick} disabled={editInDocsLoading}>
                    <HiOutlineDocumentText />
                    {editInDocsLoading ? 'Exportiere...' : 'In Docs exportieren'}
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem onSelect={handleEtherpadExport} disabled={etherpadLoading}>
                  <CiMemoPad />
                  {etherpadLoading ? 'Exportiere...' : 'In Textbegrünung exportieren'}
                </DropdownMenuItem>

                {hasChatAccess && (
                  <DropdownMenuItem onSelect={handleDiscussInChat}>
                    <IoChatbubbleOutline />
                    Im Chat besprechen
                  </DropdownMenuItem>
                )}

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={isGenerating}>
                    <IoDownloadOutline />
                    {isGenerating ? 'Wird erstellt...' : 'Datei downloaden'}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onSelect={handleDOCXDownload} disabled={isGenerating}>
                      <FaFileWord />
                      Word (.docx)
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={handlePDFDownload} disabled={isGenerating}>
                      <FaFilePdf />
                      PDF (.pdf)
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Inline editor temporarily disabled
                {onEditInDocsInline && isAuthenticated && (
                  <DropdownMenuItem onSelect={handleEditInDocsInlineClick} disabled={editInDocsInlineLoading}>
                    <IoCreateOutline />
                    {editInDocsInlineLoading ? 'Öffne Editor...' : 'Im Editor bearbeiten'}
                  </DropdownMenuItem>
                )}
                */}

                {/* Save to library temporarily disabled
                {isAuthenticated && onSaveToLibrary && (
                  <DropdownMenuItem onSelect={handleSaveToLibrary} disabled={saveToLibraryLoading}>
                    {saveIcon === 'checkmark' ? <IoCheckmarkOutline size={12} /> : <HiSave size={12} />}
                    {saveToLibraryLoading ? 'Speichere...' : 'Grünerator Bibliothek'}
                  </DropdownMenuItem>
                )}
                */}

                {/* Wolke export temporarily disabled
                {isAuthenticated && (
                  <DropdownMenuItem onSelect={handleWolkeClick} disabled={uploadingToWolke || loadingShareLinks}>
                    <FaCloud />
                    {uploadingToWolke ? 'Uploade...' : loadingShareLinks ? 'Lade...' : 'Wolke'}
                    {uploadingToWolke && <HiRefresh className="spinning" size={14} />}
                  </DropdownMenuItem>
                )}
                */}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Wolke Setup Modal */}
      {showWolkeSetupModal && (
        <WolkeSetupModal
          onClose={() => setShowWolkeSetupModal(false)}
          onSubmit={handleWolkeSetup}
        />
      )}

      {/* Textbegrünung Paste Popup */}
      {showPastePopup && (
        <div
          className="modal"
          role="dialog"
          aria-labelledby="export-modal-title"
          onClick={() => setShowPastePopup(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setShowPastePopup(false)}>
              <IoCloseOutline size={24} />
            </button>
            <h2 id="export-modal-title">Mit Textbegrünung freigeben</h2>
            <p>
              {copySucceeded
                ? 'Text wurde in Zwischenablage kopiert! Öffne dein Dokument und füge ihn mit Strg+V ein.'
                : 'Öffne das Textbegrünung-Dokument und füge deinen Text dort ein.'}
            </p>
            {padURL && (
              <>
                <div className="url-container">
                  <input type="text" value={padURL} readOnly className="url-input" />
                  <button
                    onClick={() => {
                      navigator.clipboard
                        .writeText(padURL)
                        .then(() => {
                          setUrlCopied(true);
                          setTimeout(() => setUrlCopied(false), 2000);
                        })
                        .catch((err) => console.error('Fehler beim Kopieren:', err));
                    }}
                    className={`copy-docs-link-button ${urlCopied ? 'copied' : ''}`}
                  >
                    {urlCopied ? <IoCheckmarkOutline size={20} /> : <IoCopyOutline size={20} />}
                  </button>
                </div>
                <div className="button-group">
                  <button onClick={handleCopyText} className="export-action-button">
                    {textCopyIcon} Text kopieren
                  </button>
                  <button
                    onClick={() => {
                      window.open(padURL, '_blank');
                      setShowPastePopup(false);
                    }}
                    className="open-button"
                  >
                    <IoOpenOutline size={20} /> Link öffnen
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExportDropdown;
