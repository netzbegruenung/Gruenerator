import { useState, useEffect } from 'react';
import axios from 'axios';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { extractPlainText } from './contentExtractor';

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

// DEPRECATED: Use copyFormattedContent instead
export const copyPlainText = (htmlContent) => {
  console.warn('copyPlainText is deprecated. Use copyFormattedContent instead.');
  
  // Fallback implementation for backward compatibility
  const tempElement = document.createElement('div');
  tempElement.innerHTML = htmlContent;
  const plainText = tempElement.innerText.trim();
  
  navigator.clipboard.writeText(plainText)
    .then(() => {
      console.log('Formatierter Text erfolgreich in die Zwischenablage kopiert.');
    })
    .catch((err) => {
      console.error('Fehler beim Kopieren des formatierten Textes:', err);
    });
};

// Hook to dynamically adjust text size based on length
// export const useDynamicTextSize = (text, baseSize = 1.2, minSize = 0.8, thresholds = [1000, 2000]) => {
//   const [textSize, setTextSize] = useState(`${baseSize}em`);
  
//   useEffect(() => {
//     if (text === undefined || text === null) {
//       console.log('Warning: text is undefined or null in useDynamicTextSize');
//       return;
//     }
    
//     let newSize = baseSize;
//     if (text.length > thresholds[1]) {
//       newSize = minSize;
//     } else if (text.length > thresholds[0]) {
//       newSize = (baseSize - 0.2).toFixed(1);
//     }
//     setTextSize(`${newSize}em`);
//   }, [text, baseSize, minSize, thresholds]);
  
//   return textSize;
// };

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

export const copyFormattedContent = async (contentOrOnSuccess, onSuccessOrOnError, onError) => {
  // Handle backward compatibility: if first param is a function, use old signature
  let content, onSuccess, onErrorCallback;
  
  if (typeof contentOrOnSuccess === 'function') {
    // Old signature: copyFormattedContent(onSuccess, onError)
    onSuccess = contentOrOnSuccess;
    onErrorCallback = onSuccessOrOnError;
    const { generatedText } = useGeneratedTextStore.getState();
    content = generatedText;
  } else {
    // New signature: copyFormattedContent(content, onSuccess, onError)
    content = contentOrOnSuccess;
    onSuccess = onSuccessOrOnError;
    onErrorCallback = onError;
  }

  try {
    // Use the centralized content extractor for consistent output
    const plainText = await extractPlainText(content);
    
    // For rich clipboard support, try to write both HTML and plain text
    if (navigator.clipboard && navigator.clipboard.write) {
      try {
        // Get HTML version using existing export structure
        const { extractHTMLContent } = await import('./contentExtractor');
        const htmlContent = await extractHTMLContent(content);
        
        // Create clipboard items with both formats
        const clipboardItems = [
          new ClipboardItem({
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' })
          })
        ];
        
        await navigator.clipboard.write(clipboardItems);
      } catch (richCopyError) {
        // Fallback to plain text if rich copy fails
        await navigator.clipboard.writeText(plainText);
      }
    } else {
      // Fallback for older browsers
      await navigator.clipboard.writeText(plainText);
    }
    
    if (onSuccess) {
      onSuccess();
    }
  } catch (err) {
    console.error('Fehler beim Kopieren:', err);
    if (onErrorCallback) {
      onErrorCallback(err);
    }
  }
};

export const formatQuillContent = (content) => {
  // Prüfe ob es sich um einen Suchseiten-Export handelt
  if (typeof content === 'object' && content.analysis) {
    return content.analysis;
  }

  // Temporäres Element für die Formatierung
  const tempElement = document.createElement('div');
  tempElement.innerHTML = content;

  // Formatiere Block-Elemente
  const blockElements = tempElement.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, blockquote');
  blockElements.forEach(element => {
    // Fügt Zeilenumbrüche nach Block-Elementen ein
    element.insertAdjacentHTML('afterend', '\n');
    
    // Spezielle Behandlung für Listenelemente
    if (element.tagName === 'LI') {
      element.insertAdjacentHTML('beforebegin', '• ');
    }
  });

  // Doppelte Zeilenumbrüche für bessere Lesbarkeit
  const lists = tempElement.querySelectorAll('ul, ol');
  lists.forEach(list => {
    list.insertAdjacentHTML('afterend', '\n');
  });

  // Erhalte die HTML-Struktur
  return tempElement.innerHTML;
};
