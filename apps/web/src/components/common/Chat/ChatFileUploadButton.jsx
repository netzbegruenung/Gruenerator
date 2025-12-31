import React, { useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { FaPlus } from 'react-icons/fa';

const ChatFileUploadButton = ({
  enabled = true,
  disabled = false,
  onFileSelect,
  accept = ".pdf,.jpg,.jpeg,.png,.webp",
  className = 'chat-file-upload-button',
  ariaLabel = "Datei hinzufügen",
  externalRef = null
}) => {
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

ChatFileUploadButton.propTypes = {
  enabled: PropTypes.bool,
  disabled: PropTypes.bool,
  onFileSelect: PropTypes.func,
  accept: PropTypes.string,
  className: PropTypes.string,
  ariaLabel: PropTypes.string,
  externalRef: PropTypes.object
};

export default ChatFileUploadButton;
