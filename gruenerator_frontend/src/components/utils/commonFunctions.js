import { useState, useEffect } from 'react';
import axios from 'axios';

// Function to handle form changes
export const handleChange = (e, setFormData) => {
  const { name, value } = e.target;
  setFormData((prevData) => ({
    ...prevData,
    [name]: value,
  }));
};

// Function to submit forms and process the response
export const handleSubmit = async (url, formData, setGeneratedText, setLoading) => {
  setLoading(true);
  try {
    const response = await axios.post(url, formData);
    setGeneratedText(response.data);
  } catch (error) {
    console.error('Error generating text:', error);
  } finally {
    setLoading(false);
  }
};

// Function to copy text to clipboard
export const handleCopyToClipboard = (text) => {
  navigator.clipboard.writeText(text)
    .then(() => {
      console.log('Text copied to clipboard');
    })
    .catch((err) => {
      console.error('Failed to copy text: ', err);
    });
};

// Hook to dynamically adjust text size based on length
export const useDynamicTextSize = (text, baseSize = 1.2, minSize = 0.8, thresholds = [1000, 2000]) => {
  const [textSize, setTextSize] = useState(`${baseSize}em`);

  useEffect(() => {
    let newSize = baseSize;
    if (text.length > thresholds[1]) {
      newSize = minSize;
    } else if (text.length > thresholds[0]) {
      newSize = (baseSize - 0.2).toFixed(1);
    } else {
      newSize = baseSize;
    }
    setTextSize(`${newSize}em`);
  }, [text, baseSize, minSize, thresholds]);

  return textSize;
};

export const useScrollRestoration = () => {
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }, []);
};
// File handling functions
export const handleFileChange = (e, setFile, setFileName) => {
  const file = e.target.files[0];
  setFile(file);
  setFileName(file ? file.name : '');
};

export const handleDragEnter = (e, setDragging) => {
  e.preventDefault();
  setDragging(true);
};

export const handleDragLeave = (e, setDragging) => {
  e.preventDefault();
  setDragging(false);
};

export const handleDragOver = (e) => {
  e.preventDefault();
};

export const handleDrop = (e, setDragging, setFile, setFileName) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  setFile(file);
  setFileName(file ? file.name : '');
  setDragging(false);
};