import { useRef, useEffect } from 'react';
import { FiUpload, FiFile } from 'react-icons/fi';

import useTextFileUpload from '../hooks/useTextFileUpload';

interface FileUploadTextProps {
  onFileSelect?: (file: File) => void;
  allowedTypes: string[];
  maxSize: number;
}

const FileUpload_Text = ({ onFileSelect, allowedTypes, maxSize }: FileUploadTextProps) => {
  console.log('FileUpload_Text wird gerendert');

  const {
    file,
    fileName,
    error,
    dragging,
    handleFileChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  } = useTextFileUpload(allowedTypes, maxSize);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (file && onFileSelect) {
      console.log('Datei an übergeordnete Komponente weitergegeben:', file.name);
      onFileSelect(file);
    }
  }, [file, onFileSelect]);

  const handleClick = () => {
    console.log('Datei-Auswahl-Dialog geöffnet');
    fileInputRef.current?.click();
  };

  console.log('FileUpload_Text wird gerendert mit Zuständen:', {
    fileName,
    error,
    dragging,
  });

  return (
    <div
      className={`file-upload-text ${dragging ? 'dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          handleFileChange(e.target.files?.[0] || null)
        }
        accept={allowedTypes.join(',')}
        style={{ display: 'none' }}
      />
      <div className="upload-area" onClick={handleClick}>
        {file ? (
          <>
            <FiFile size={24} />
            <span>{fileName}</span>
          </>
        ) : (
          <>
            <FiUpload size={24} />
            <span>PDF-Datei hier ablegen oder klicken zum Auswählen</span>
          </>
        )}
      </div>
      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

export default FileUpload_Text;
