import { useState, type DragEvent, type ChangeEvent } from 'react';

/**
 * Default accepted file types for document uploads
 */
export const DEFAULT_ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
] as const;

/**
 * Return type for useFileHandling hook
 */
export interface UseFileHandlingReturn {
  file: File | null;
  fileName: string;
  dragging: boolean;
  error: string;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleDragEnter: (e: DragEvent<HTMLElement>) => void;
  handleDragLeave: (e: DragEvent<HTMLElement>) => void;
  handleDragOver: (e: DragEvent<HTMLElement>) => void;
  handleDrop: (event: DragEvent<HTMLElement>) => void;
}

/**
 * Custom hook for handling file uploads with drag and drop support
 */
export const useFileHandling = (
  acceptedFileTypes: readonly string[] = DEFAULT_ACCEPTED_FILE_TYPES
): UseFileHandlingReturn => {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const isValidFileType = (fileToCheck: File): boolean =>
    acceptedFileTypes.includes(fileToCheck.type);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const newFile = event.target.files?.[0];
    if (newFile && isValidFileType(newFile)) {
      setFile(newFile);
      setFileName(newFile.name);
      setError('');
    } else {
      setError('Ungültiger Dateityp. Bitte wählen Sie eine unterstützte Datei.');
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLElement>): void => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault();
    setDragging(false);
    const newFile = event.dataTransfer.files[0];
    if (newFile && isValidFileType(newFile)) {
      setFile(newFile);
      setFileName(newFile.name);
      setError('');
    } else {
      setError('Ungültiger Dateityp. Bitte wählen Sie eine unterstützte Datei.');
    }
  };

  return {
    file,
    fileName,
    dragging,
    error,
    handleFileChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  };
};
