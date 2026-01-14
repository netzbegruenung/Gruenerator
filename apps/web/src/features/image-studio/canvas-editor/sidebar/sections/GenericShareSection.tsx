import { useCallback, useState } from 'react';
import { SubsectionTabBar } from '../SubsectionTabBar';
import { FaDownload, FaShareAlt, FaImages, FaSave, FaCheck } from 'react-icons/fa';
import { IoCheckmarkOutline } from 'react-icons/io5';
import Spinner from '../../../../../components/common/Spinner';
import { useShareStore } from '@gruenerator/shared/share';
import '../../../../../assets/styles/features/templates.css';

export interface GenericShareSectionProps {
  exportedImage: string | null;
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  shareToken: string | null;
  onCaptureCanvas: () => void;
  onDownload: () => void;
  onNavigateToGallery: () => void;
  canvasText: string;
  canvasType: string;
}

// Download Subsection
function DownloadSubsection({
  exportedImage,
  autoSaveStatus,
  shareToken,
  onCaptureCanvas,
  onDownload,
  onNavigateToGallery,
}: GenericShareSectionProps) {
  const [downloadState, setDownloadState] = useState<'idle' | 'capturing' | 'success'>('idle');

  const handleDownloadClick = async () => {
    setDownloadState('capturing');

    try {
      // Capture canvas
      await onCaptureCanvas();

      // Wait a brief moment for state update
      await new Promise(resolve => setTimeout(resolve, 150));

      // Auto-download (onDownload uses the latest exportedImage)
      onDownload();

      // Show success state
      setDownloadState('success');

      // Reset after 1.5 seconds
      setTimeout(() => {
        setDownloadState('idle');
      }, 1500);
    } catch (error) {
      console.error('[DownloadSubsection] Download failed:', error);
      setDownloadState('idle');
    }
  };

  return (
    <div className="share-subsection">
      <h3 className="share-subsection__title">Download</h3>

      <button
        className="btn btn-primary"
        onClick={handleDownloadClick}
        disabled={downloadState !== 'idle'}
        type="button"
      >
        {downloadState === 'capturing' && (
          <>
            <Spinner size="small" />
            Erfassen...
          </>
        )}
        {downloadState === 'success' && (
          <>
            <FaCheck />
            Erfolgreich
          </>
        )}
        {downloadState === 'idle' && (
          <>
            <FaDownload />
            Bild herunterladen
          </>
        )}
      </button>

      {/* Show auto-save status after successful download */}
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

// Platform Sharing Subsection
function PlatformsSubsection({
  exportedImage,
  canvasText,
}: GenericShareSectionProps) {
  const handlePlatformShare = useCallback(async (platform: string) => {
    if (!exportedImage) return;

    const blob = await (await fetch(exportedImage)).blob();
    const file = new File([blob], 'gruenerator.png', { type: 'image/png' });

    // Try native Web Share API first
    if (navigator.share && navigator.canShare({ files: [file], text: canvasText })) {
      try {
        await navigator.share({
          files: [file],
          text: canvasText,
          title: 'Grünerator Share',
        });
        return;
      } catch (err) {
        console.error('Share failed:', err);
      }
    }

    // Platform-specific fallbacks
    const shareUrl = URL.createObjectURL(blob);
    const text = encodeURIComponent(canvasText);

    const urls: Record<string, string> = {
      instagram: shareUrl, // Instagram requires app
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`,
      twitter: `https://twitter.com/intent/tweet?text=${text}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`,
      whatsapp: `https://api.whatsapp.com/send?text=${text}`,
    };

    if (urls[platform]) {
      window.open(urls[platform], '_blank', 'width=600,height=400');
    }
  }, [exportedImage, canvasText]);

  if (!exportedImage) {
    return (
      <div className="share-subsection">
        <p className="share-message">Bild zuerst erfassen, um zu teilen</p>
      </div>
    );
  }

  return (
    <div className="share-subsection">
      <h3 className="share-subsection__title">Auf Plattformen teilen</h3>

      <div className="platform-buttons">
        <button
          className="platform-button platform-button--instagram"
          onClick={() => handlePlatformShare('instagram')}
          type="button"
        >
          Instagram
        </button>
        <button
          className="platform-button platform-button--facebook"
          onClick={() => handlePlatformShare('facebook')}
          type="button"
        >
          Facebook
        </button>
        <button
          className="platform-button platform-button--twitter"
          onClick={() => handlePlatformShare('twitter')}
          type="button"
        >
          Twitter
        </button>
        <button
          className="platform-button platform-button--linkedin"
          onClick={() => handlePlatformShare('linkedin')}
          type="button"
        >
          LinkedIn
        </button>
        <button
          className="platform-button platform-button--whatsapp"
          onClick={() => handlePlatformShare('whatsapp')}
          type="button"
        >
          WhatsApp
        </button>
      </div>
    </div>
  );
}

// Template Subsection
function TemplateSubsection({
  shareToken,
  canvasType
}: GenericShareSectionProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const { saveAsTemplate } = useShareStore();

  const handleSaveAsTemplate = async () => {
    if (!shareToken) {
      alert('Bild zuerst erfassen, um als Vorlage zu speichern');
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveAsTemplate(
        shareToken,
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
          <p className="share-message">
            Design öffentlich teilen
          </p>

          <button
            className="btn btn-primary"
            onClick={handleSaveAsTemplate}
            disabled={isSaving || !shareToken}
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

// Main Component
export function GenericShareSection(props: GenericShareSectionProps) {
  const subsections = [
    {
      id: 'download',
      icon: FaDownload,
      label: 'Download',
      content: <DownloadSubsection {...props} />,
    },
    {
      id: 'platforms',
      icon: FaShareAlt,
      label: 'Teilen',
      content: <PlatformsSubsection {...props} />,
    },
    {
      id: 'template',
      icon: FaSave,
      label: 'Vorlage',
      content: <TemplateSubsection {...props} />,
    },
  ];

  return <SubsectionTabBar subsections={subsections} defaultSubsection="download" />;
}
