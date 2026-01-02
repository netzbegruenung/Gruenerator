import { useState } from 'react';
import { IoCopyOutline, IoCheckmarkOutline } from 'react-icons/io5';
import { copyFormattedContent } from '../utils/commonFunctions';

export type CopyButtonVariant = 'default' | 'icon';

export interface CopyButtonProps {
  compact?: boolean;
  variant?: CopyButtonVariant;
  size?: string;
  position?: string;
  className?: string;
  content?: string;
  directContent?: string;
}

const CopyButton = ({
  compact = false,
  variant = 'default',
  className = '',
  content,
  directContent
}: CopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const isMobileView = window.innerWidth <= 768;

  const handleCopy = async () => {
    if (directContent) {
      try {
        await navigator.clipboard.writeText(directContent);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (error) {
        console.error('Fehler beim Kopieren:', error);
      }
    } else if (content) {
      await copyFormattedContent(
        content,
        () => {
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        },
        (error: unknown) => {
          console.error('Fehler beim Kopieren:', error);
        }
      );
    } else {
      await copyFormattedContent(
        () => {
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        },
        (error: unknown) => {
          console.error('Fehler beim Kopieren:', error);
        }
      );
    }
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleCopy}
        className={`action-button copy-button ${className} ${isCopied ? 'copied' : ''}`}
        aria-label={isCopied ? 'Kopiert!' : 'In die Zwischenablage kopieren'}
        {...(!isMobileView && {
          'data-tooltip-id': 'action-tooltip',
          'data-tooltip-content': isCopied ? 'Kopiert!' : 'In die Zwischenablage kopieren'
        })}
      >
        {isCopied ? <IoCheckmarkOutline size={16} /> : <IoCopyOutline size={16} />}
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      className={`copy-button ${compact ? 'copy-button-compact' : ''} ${isCopied ? 'copied' : ''} ${className}`}
      aria-label={isCopied ? 'Kopiert!' : 'In die Zwischenablage kopieren'}
      title={isCopied ? 'Kopiert!' : 'In die Zwischenablage kopieren'}
    >
      {isCopied ? (
        <>
          <IoCheckmarkOutline className="copy-icon" />
          {!compact && <span>Kopiert!</span>}
        </>
      ) : (
        <>
          <IoCopyOutline className="copy-icon" />
          {!compact && <span>In die Zwischenablage kopieren</span>}
        </>
      )}
    </button>
  );
};

export default CopyButton;
