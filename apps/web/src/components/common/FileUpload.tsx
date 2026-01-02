import { useRef } from 'react';
import { HiX } from 'react-icons/hi';

interface FileUploadProps {
  handleChange: () => void;
  error?: string;
  allowedTypes?: string[];
  loading?: boolean;
  file?: Record<string, unknown>;
  label?: string;
}

const FileUpload = ({ handleChange, error, allowedTypes, loading, file, label = "Datei auswählen" }: FileUploadProps): JSX.Element => {
  const fileInputRef = useRef(null);

  const onFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      handleChange(selectedFile);
    }
  };

  const handleRemoveFile = (e) => {
    e.stopPropagation(); // Prevent file input from opening
    handleChange(null);
  };

  return (
    <div className="form-field-wrapper">
      {label && (
        <label className="form-field-label">
          {label}
        </label>
      )}
      <input
        type="file"
        onChange={onFileSelect}
        accept={allowedTypes.join(',')}
        ref={fileInputRef}
        style={{ display: 'none' }}
        disabled={loading}
      />
      <div className="file-upload-input-wrapper">
        <button
          type="button"
          onClick={() => fileInputRef.current.click()}
          disabled={loading}
          className={`file-upload-button ${file ? 'file-upload-button--with-file' : ''}`}
        >
          {file ? (
            <>
              <span className="file-upload-filename">{file.name}</span>
              <span
                role="button"
                onClick={handleRemoveFile}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleRemoveFile(e);
                  }
                }}
                className="file-upload-remove"
                aria-label="Datei entfernen"
                tabIndex={loading ? -1 : 0}
                style={{ pointerEvents: loading ? 'none' : 'auto', opacity: loading ? 0.5 : 1 }}
              >
                <HiX />
              </span>
            </>
          ) : (
            loading ? 'Laden...' : 'Datei auswählen'
          )}
        </button>
      </div>
      {error && <div className="form-field-error">{error}</div>}
    </div>
  );
};

export default FileUpload;
