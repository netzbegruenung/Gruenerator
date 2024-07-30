import { useState, useCallback } from 'react';

const useImageUpload = () => {
  const [file, setFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const handleFileChange = useCallback((event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      console.log('File selected:', selectedFile);
      setFile(selectedFile);
      setUploadError(null);
    }
  }, []);

  const uploadAndProcessFile = useCallback(async () => {
    if (!file) {
      console.error('No file selected');
      setUploadError('Bitte wählen Sie ein Bild aus.');
      return;
    }

    setUploadLoading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);

      console.log('Sending request to /api/upload');
      console.log('FormData content:', [...formData.entries()]);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server error response:', errorText);
        throw new Error(`Network error during upload: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Received data:', data);
      return data;
    } catch (error) {
      console.error('Error during upload:', error);
      setUploadError(error.message);
      throw error;
    } finally {
      setUploadLoading(false);
    }
  }, [file]);

  const resetUpload = useCallback(() => {
    setFile(null);
    setUploadError(null);
  }, []);

  return {
    file,
    uploadLoading,
    uploadError,
    handleFileChange,
    uploadAndProcessFile,
    resetUpload
  };
};

export default useImageUpload;