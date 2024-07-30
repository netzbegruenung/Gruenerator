import { useState, useCallback } from 'react';
import FileUploadService from './FileUploadService';

const useFileUpload = (allowedTypes, maxSize = 10 * 1024 * 1024) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  const validateFile = useCallback((file) => {
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Ungültiger Dateityp');
    }
    if (file.size > maxSize) {
      throw new Error(`Dateigröße überschreitet ${maxSize / 1024 / 1024} MB`);
    }
  }, [allowedTypes, maxSize]);

  const handleFileChange = useCallback((event) => {
    const selectedFile = event.target.files[0];
    try {
      validateFile(selectedFile);
      setFile(selectedFile);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [validateFile]);

  const uploadFile = useCallback(async () => {
    if (!file) return;

    setLoading(true);
    setProgress(0);

    try {
      const result = await FileUploadService.uploadAndProcess(file, setProgress);
      setLoading(false);
      return result;
    } catch (err) {
      setError(err.message);
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