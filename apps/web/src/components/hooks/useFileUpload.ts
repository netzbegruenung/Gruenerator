import { useState, useCallback } from 'react';

import FileUploadService from '../utils/FileUpload';

interface UseFileUploadReturn {
  file: File | null;
  loading: boolean;
  error: string | null;
  progress: number;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  uploadFile: () => Promise<unknown>;
}

const useFileUpload = (
  allowedTypes: string[],
  maxSize: number = 10 * 1024 * 1024
): UseFileUploadReturn => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);

  const validateFile = useCallback(
    (fileToValidate: File): void => {
      if (!allowedTypes.includes(fileToValidate.type)) {
        throw new Error('Ungültiger Dateityp');
      }
      if (fileToValidate.size > maxSize) {
        throw new Error(`Dateigröße überschreitet ${maxSize / 1024 / 1024} MB`);
      }
    },
    [allowedTypes, maxSize]
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const selectedFile = event.target.files?.[0];
      if (!selectedFile) return;
      try {
        validateFile(selectedFile);
        setFile(selectedFile);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [validateFile]
  );

  const uploadFile = useCallback(async (): Promise<unknown> => {
    if (!file) return;

    setLoading(true);
    setProgress(0);

    try {
      const result = await FileUploadService.uploadAndProcess(file, setProgress);
      setLoading(false);
      return result;
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }, [file]);

  return {
    file,
    loading,
    error,
    progress,
    handleFileChange,
    uploadFile,
  };
};

export default useFileUpload;
