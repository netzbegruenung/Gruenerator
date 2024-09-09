import { useState } from 'react';

export const useFileHandling = (acceptedFileTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text']) => {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const isValidFileType = (file) => acceptedFileTypes.includes(file.type);

  const handleFileChange = (event) => {
    const newFile = event.target.files[0];
    if (newFile && isValidFileType(newFile)) {
      setFile(newFile);
      setFileName(newFile.name);
      setError('');
    } else {
      setError('Ungültiger Dateityp. Bitte wählen Sie eine unterstützte Datei.');
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (event) => {
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
