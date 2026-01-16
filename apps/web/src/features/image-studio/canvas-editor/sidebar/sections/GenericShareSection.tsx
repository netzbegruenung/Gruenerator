import { useCallback, useState, useMemo } from 'react';
import { SubsectionTabBar } from '../SubsectionTabBar';
import { FaDownload, FaImages, FaSave, FaCheck, FaInstagram, FaCopy } from 'react-icons/fa';
import { MdTextFields } from 'react-icons/md';
import { IoCheckmarkOutline, IoShareOutline } from 'react-icons/io5';
import Spinner from '../../../../../components/common/Spinner';
import { useShareStore } from '@gruenerator/shared/share';
import { useAutoSaveStore } from '../../../hooks/useAutoSaveStore';
import { useGenerateSocialPost } from '../../../../../components/hooks/useGenerateSocialPost';
import '../../../../../assets/styles/features/templates.css';

export interface GenericShareSectionProps {
  exportedImage: string | null;
  shareToken: string | null;
  onCaptureCanvas: () => void;
  onDownload: () => void;
  onNavigateToGallery: () => void;
  canvasText: string;
  canvasType: string;
}

// Download & Share Subsection - combined with 2 icon buttons
function DownloadShareSubsection({
  exportedImage,
  shareToken,
  onCaptureCanvas,
  onDownload,
  onNavigateToGallery,
  canvasText,
}: Omit<GenericShareSectionProps, 'canvasType'>) {
  const [downloadState, setDownloadState] = useState<'idle' | 'capturing' | 'success'>('idle');
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  const autoSaveStatus = useAutoSaveStore((s) => s.autoSaveStatus);
  const canUseNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  const handleDownloadClick = async () => {
    setDownloadState('capturing');
    try {
      await onCaptureCanvas();
      await new Promise(resolve => setTimeout(resolve, 150));
      onDownload();
      setDownloadState('success');
      setTimeout(() => setDownloadState('idle'), 1500);
    } catch (error) {
      console.error('[DownloadShareSubsection] Download failed:', error);
      setDownloadState('idle');
    }
  };

  const handleNativeShare = useCallback(async () => {
    if (!exportedImage) {
      // Auto-capture if no image yet
      await onCaptureCanvas();
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    const imageToShare = exportedImage || useAutoSaveStore.getState().autoSavedShareToken;
    if (!imageToShare) return;

    setIsSharing(true);
    try {
      const blob = await (await fetch(exportedImage!)).blob();
      const file = new File([blob], 'gruenerator.png', { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: canvasText,
          title: 'Grünerator Share',
        });
      } else {
        await navigator.share({
          text: canvasText,
          title: 'Grünerator Share',
        });
      }
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    } finally {
      setIsSharing(false);
    }
  }, [exportedImage, canvasText, onCaptureCanvas]);

  return (
    <div className="share-subsection">
      <h3 className="share-subsection__title">Download & Teilen</h3>

      <div className="platform-icons">
        <button
          className="platform-icon-btn platform-icon-btn--download"
          onClick={handleDownloadClick}
          disabled={downloadState !== 'idle'}
          title="Herunterladen"
          aria-label="Bild herunterladen"
          type="button"
        >
          {downloadState === 'capturing' ? <Spinner size="small" /> :
           downloadState === 'success' ? <FaCheck /> : <FaDownload />}
        </button>

        {canUseNativeShare && (
          <button
            className="platform-icon-btn platform-icon-btn--native"
            onClick={handleNativeShare}
            disabled={isSharing}
            title="Teilen"
            aria-label="Bild teilen"
            type="button"
          >
            {isSharing ? <Spinner size="small" /> : shareSuccess ? <FaCheck /> : <IoShareOutline />}
          </button>
        )}
      </div>

      {downloadState === 'success' && autoSaveStatus === 'saving' && (
        <div className="share-status">
          <Spinner size="small" />
          <span>Wird synchronisiert...</span>
        </div>
      )}

      {downloadState === 'success' && autoSaveStatus === 'saved' && shareToken && (
        <>
          <div className="share-status share-status--success">
            <IoCheckmarkOutline />
            <span>In Galerie gesichert</span>
          </div>
          <button
            className="btn btn-secondary"
            onClick={onNavigateToGallery}
            type="button"
          >
            <FaImages />
            Zur Galerie
          </button>
        </>
      )}

      {downloadState === 'success' && autoSaveStatus === 'error' && (
        <div className="share-status share-status--error">
          <span>Fehler beim Speichern</span>
        </div>
      )}
    </div>
  );
}

// Template Subsection
function TemplateSubsection({
  shareToken,
  onCaptureCanvas,
  canvasType
}: Pick<GenericShareSectionProps, 'shareToken' | 'onCaptureCanvas' | 'canvasType'>) {
  const [isSaving, setIsSaving] = useState(false);
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const { saveAsTemplate } = useShareStore();
  const currentShareToken = useAutoSaveStore((s) => s.autoSavedShareToken);

  const handleSaveAsTemplate = async () => {
    setIsSaving(true);

    try {
      let tokenToUse = shareToken || currentShareToken;

      // Auto-capture if no shareToken exists
      if (!tokenToUse) {
        await onCaptureCanvas();
        // Wait for auto-save to complete
        await new Promise<void>((resolve, reject) => {
          const checkStatus = () => {
            const status = useAutoSaveStore.getState().autoSaveStatus;
            const token = useAutoSaveStore.getState().autoSavedShareToken;
            if (status === 'saved' && token) {
              resolve();
            } else if (status === 'error') {
              reject(new Error('Auto-save failed'));
            } else {
              setTimeout(checkStatus, 100);
            }
          };
          setTimeout(checkStatus, 200);
        });
        tokenToUse = useAutoSaveStore.getState().autoSavedShareToken;
      }

      if (!tokenToUse) {
        throw new Error('Kein Share-Token verfügbar');
      }

      const result = await saveAsTemplate(
        tokenToUse,
        `${canvasType} Vorlage`,
        'public'
      );
      if (result.success) {
        setTemplateUrl(`${window.location.origin}${result.templateUrl}`);
      }
    } catch (error) {
      console.error('Failed to save template:', error);
      alert('Fehler beim Speichern der Vorlage');
    } finally {
      setIsSaving(false);
    }
  };

  const copyTemplateLink = () => {
    if (templateUrl) {
      navigator.clipboard.writeText(templateUrl);
      // Optional: Show toast notification
    }
  };

  return (
    <div className="share-subsection">
      <h3 className="share-subsection__title">Vorlage</h3>

      {!templateUrl ? (
        <>
          <button
            className="btn btn-primary"
            onClick={handleSaveAsTemplate}
            disabled={isSaving}
            type="button"
          >
            {isSaving ? (
              <>
                <Spinner size="small" />
                Speichern...
              </>
            ) : (
              <>
                <FaSave /> Als Vorlage speichern
              </>
            )}
          </button>
        </>
      ) : (
        <>
          <div className="share-status share-status--success">
            <IoCheckmarkOutline />
            <span>Gespeichert</span>
          </div>

          <div className="template-link-display">
            <label>Link</label>
            <input
              type="text"
              value={templateUrl}
              readOnly
              className="share-textarea"
              onClick={(e) => e.currentTarget.select()}
            />
          </div>

          <button
            className="btn btn-secondary"
            onClick={copyTemplateLink}
            type="button"
          >
            Link kopieren
          </button>
        </>
      )}
    </div>
  );
}

// Instagram Text Subsection
interface GeneratedPosts {
  instagram?: string;
  [key: string]: string | undefined;
}

function InstagramTextSubsection({
  canvasText,
  canvasType,
}: Pick<GenericShareSectionProps, 'canvasText' | 'canvasType'>) {
  const [copied, setCopied] = useState(false);
  const socialPostHook = useGenerateSocialPost() as unknown as {
    generatedPosts: GeneratedPosts;
    generatePost: (thema: string, details: string, platforms: string[], includeActionIdeas: boolean) => Promise<unknown>;
    loading: boolean;
  };
  const { generatedPosts, generatePost, loading } = socialPostHook;

  const handleGenerate = async () => {
    if (!canvasText.trim() || loading) return;
    await generatePost(canvasText, `Sharepic: ${canvasType}`, ['instagram'], false);
  };

  const handleCopy = async () => {
    if (generatedPosts?.instagram) {
      await navigator.clipboard.writeText(generatedPosts.instagram);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="share-subsection">
      <h3 className="share-subsection__title">Instagram Text</h3>

      {!generatedPosts?.instagram ? (
        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={loading || !canvasText.trim()}
          type="button"
        >
          {loading ? (
            <>
              <Spinner size="small" />
              Generiere...
            </>
          ) : (
            <>
              <FaInstagram />
              Text generieren
            </>
          )}
        </button>
      ) : (
        <>
          <textarea
            readOnly
            value={generatedPosts.instagram}
            className="share-textarea"
            rows={6}
            onClick={(e) => e.currentTarget.select()}
          />
          <button
            className="btn btn-secondary"
            onClick={handleCopy}
            type="button"
          >
            {copied ? <FaCheck /> : <FaCopy />}
            {copied ? 'Kopiert!' : 'Kopieren'}
          </button>
        </>
      )}
    </div>
  );
}

export function GenericShareSection({
  exportedImage,
  shareToken,
  onCaptureCanvas,
  onDownload,
  onNavigateToGallery,
  canvasText,
  canvasType,
}: GenericShareSectionProps) {
  const subsections = useMemo(() => [
    {
      id: 'download',
      icon: FaDownload,
      label: 'Download',
      content: (
        <DownloadShareSubsection
          exportedImage={exportedImage}
          shareToken={shareToken}
          onCaptureCanvas={onCaptureCanvas}
          onDownload={onDownload}
          onNavigateToGallery={onNavigateToGallery}
          canvasText={canvasText}
        />
      ),
    },
    {
      id: 'template',
      icon: FaSave,
      label: 'Vorlage',
      content: (
        <TemplateSubsection
          shareToken={shareToken}
          onCaptureCanvas={onCaptureCanvas}
          canvasType={canvasType}
        />
      ),
    },
    {
      id: 'instagram-text',
      icon: MdTextFields,
      label: 'Text',
      content: (
        <InstagramTextSubsection
          canvasText={canvasText}
          canvasType={canvasType}
        />
      ),
    },
  ], [exportedImage, shareToken, onCaptureCanvas, onDownload, onNavigateToGallery, canvasText, canvasType]);

  return <SubsectionTabBar subsections={subsections} defaultSubsection="download" />;
}
