import { useRef, useCallback } from 'react';
import { FaPlus } from 'react-icons/fa';

interface ChatFileUploadButtonProps {
  enabled?: boolean;
  disabled?: boolean;
  onFileSelect?: () => void;
  accept?: string;
  className?: string;
  ariaLabel?: string;
  externalRef?: Record<string, unknown>;
}

const ChatFileUploadButton = ({ enabled = true,
  disabled = false,
  onFileSelect,
  accept = ".pdf,.jpg,.jpeg,.png,.webp",
  className = 'chat-file-upload-button',
  ariaLabel = "Datei hinzufügen",
  externalRef = null }: ChatFileUploadButtonProps): JSX.Element => {
  const internalRef = useRef(null);
  const fileInputRef = externalRef || internalRef;

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, [fileInputRef]);

  const handleChange = useCallback((event) => {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
      onFileSelect?.(files);
    }
    event.target.value = '';
  }, [onFileSelect]);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={handleClick}
        disabled={disabled}
        aria-label={ariaLabel}
      >
        <FaPlus />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={accept}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
    </>
  );
};

export default ChatFileUploadButton;
