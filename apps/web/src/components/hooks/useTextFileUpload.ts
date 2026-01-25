import { useState, useCallback } from 'react';

interface UseTextFileUploadReturn {
  file: File | null;
  fileName: string;
  loading: boolean;
  error: string;
  dragging: boolean;
  handleFileChange: (selectedFile: File | null) => Promise<void>;
  handleDragEnter: (e: React.DragEvent<HTMLElement>) => void;
  handleDragLeave: (e: React.DragEvent<HTMLElement>) => void;
  handleDragOver: (e: React.DragEvent<HTMLElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLElement>) => void;
}

const useTextFileUpload = (
  allowedTypes: string[],
  maxSize: number = 5 * 1024 * 1024
): UseTextFileUploadReturn => {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const validateFile = useCallback(
    (fileToValidate: File) => {
      if (!allowedTypes.includes(fileToValidate.type)) {
        throw new Error('Ungültiger Dateityp. Bitte wählen Sie eine unterstützte Textdatei.');
      }
      if (fileToValidate.size > maxSize) {
        throw new Error(`Dateigröße überschreitet ${maxSize / 1024 / 1024} MB`);
      }
    },
    [allowedTypes, maxSize]
  );

  const handleFileChange = useCallback(
    async (selectedFile: File | null) => {
      setLoading(true);
      setError('');
      try {
        if (!selectedFile) {
          setFile(null);
          setFileName('');
          return;
        }
        validateFile(selectedFile);
        setFile(selectedFile);
        setFileName(selectedFile.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten');
        setFile(null);
        setFileName('');
      } finally {
        setLoading(false);
      }
    },
    [validateFile]
  );

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      const droppedFile = e.dataTransfer.files[0] ?? null;
      void handleFileChange(droppedFile);
    },
    [handleFileChange]
  );

  return {
    file,
    fileName,
    loading,
    error,
    dragging,
    handleFileChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  };
};

export default useTextFileUpload;
