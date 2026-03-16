import { type JSX, useRef } from 'react';
import { FaUpload } from 'react-icons/fa';

interface UnsplashImage {
  photographerName?: string;
  [key: string]: unknown;
}

import { buttonWrapper } from '../../utils/buttonStyles';
import { cn } from '../../utils/cn';

interface FileUploadProps {
  loading?: boolean;
  file?: File | null;
  handleChange?: (file: File) => void;
  error?: string;
  allowedTypes?: string[];
  selectedUnsplashImage?: UnsplashImage | null;
  isCompact?: boolean;
  buttonText?: string;
}

const FileUpload = ({
  loading,
  file,
  handleChange,
  error,
  allowedTypes,
  selectedUnsplashImage,
  isCompact,
}: FileUploadProps): JSX.Element => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = (event: React.MouseEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    console.log('File input clicked');
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Clear the input value to ensure it always triggers the change event
      fileInputRef.current.click();
    }
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      console.log('FileUpload - Files:', event.target.files);
      const selectedFile = event?.target?.files?.[0];
      if (selectedFile) {
        console.log('FileUpload - Selected file:', selectedFile);
        handleChange?.(selectedFile);
      } else {
        console.log('FileUpload - Keine Datei ausgewählt');
      }
    } catch (error) {
      console.error('FileUpload - Fehler beim Datei-Upload:', error);
    }
  };

  const renderContent = () => {
    if (loading) {
      return <span>Laden...</span>;
    }

    if (file) {
      const fileName = file.name || 'Datei';
      const displayName = fileName.length > 20 ? fileName.substring(0, 17) + '...' : fileName;
      return (
        <>
          <FaUpload />
          <span>{displayName}</span>
        </>
      );
    }

    if (selectedUnsplashImage) {
      return (
        <>
          <FaUpload />
          <span>Unsplash: {selectedUnsplashImage.photographerName}</span>
        </>
      );
    }

    return (
      <>
        <FaUpload />
        <span>Datei auswählen</span>
      </>
    );
  };

  return (
    <div className={cn(buttonWrapper, isCompact && 'compact')}>
      <input
        id="fileUpload"
        type="file"
        name="fileUpload"
        onChange={onFileChange}
        accept={
          Array.isArray(allowedTypes) && allowedTypes.length > 0
            ? allowedTypes.join(',')
            : 'image/*'
        }
        ref={fileInputRef}
        style={{ display: 'none' }}
      />
      <label
        htmlFor="fileUpload"
        className={cn(
          'flex items-center justify-center w-full h-[42px] px-5 py-2.5 border-2 border-white rounded-[7px] text-base cursor-pointer transition-all duration-300 bg-secondary-600 text-white gap-2 whitespace-nowrap hover:bg-secondary-700 hover:scale-[1.01]',
          loading && 'cursor-wait'
        )}
        onClick={handleClick}
        aria-label={isCompact ? 'Datei hochladen' : undefined}
      >
        {renderContent()}
      </label>
      {!isCompact && error && <div className="error-message">{error}</div>}
    </div>
  );
};

export default FileUpload;
