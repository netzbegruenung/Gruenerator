import { useState, useCallback } from 'react';

const useTextFileUpload = (allowedTypes, maxSize = 5 * 1024 * 1024) => {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const validateFile = useCallback((file) => {
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Ungültiger Dateityp. Bitte wählen Sie eine unterstützte Textdatei.');
    }
    if (file.size > maxSize) {
      throw new Error(`Dateigröße überschreitet ${maxSize / 1024 / 1024} MB`);
    }
  }, [allowedTypes, maxSize]);

  const handleFileChange = useCallback(async (selectedFile) => {
    setLoading(true);
    setError('');
    try {
      validateFile(selectedFile);
      setFile(selectedFile);
      setFileName(selectedFile.name);
    } catch (err) {
      setError(err.message);
      setFile(null);
      setFileName('');
    } finally {
      setLoading(false);
    }
  }, [validateFile]);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    handleFileChange(droppedFile);
  }, [handleFileChange]);

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