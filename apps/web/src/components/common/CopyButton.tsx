import { useState } from 'react';
import { IoCopyOutline, IoCheckmarkOutline } from 'react-icons/io5';

import { copyButton } from '../../utils/buttonStyles';
import { cn } from '../../utils/cn';
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
  directContent,
}: CopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const isMobileView = window.innerWidth <= 768;

  const handleCopy = async () => {
    const onSuccess = () => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    };
    const onError = (error: unknown) => {
      console.error('Fehler beim Kopieren:', error);
    };

    if (directContent) {
      try {
        await navigator.clipboard.writeText(directContent);
        onSuccess();
      } catch (error) {
        onError(error);
      }
    } else if (content) {
      await copyFormattedContent(content, onSuccess, onError);
    } else {
      // Old signature without content - uses generatedText from store
      await copyFormattedContent(onSuccess, onError, undefined);
    }
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleCopy}
        className={cn(copyButton, className, isCopied && 'bg-primary-600 text-white')}
        aria-label={isCopied ? 'Kopiert!' : 'In die Zwischenablage kopieren'}
        {...(!isMobileView && {
          'data-tooltip-id': 'action-tooltip',
          'data-tooltip-content': isCopied ? 'Kopiert!' : 'In die Zwischenablage kopieren',
        })}
      >
        {isCopied ? <IoCheckmarkOutline size={16} /> : <IoCopyOutline size={16} />}
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        copyButton,
        compact && 'p-2 w-9 h-9 rounded bg-transparent text-primary-600 border border-primary-600',
        isCopied && compact && 'bg-primary-600 text-white',
        className
      )}
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
