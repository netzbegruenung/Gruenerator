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

// Function to copy plain text to clipboard
export const copyPlainText = (htmlContent) => {
  // Temporäres DOM-Element erstellen
  const tempElement = document.createElement('div');
  tempElement.innerHTML = htmlContent;
  
  // Zeilenumbrüche für Block-Elemente hinzufügen
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

  // Extrahiere den formatierten Text
  const plainText = tempElement.innerText
    .replace(/\n{3,}/g, '\n\n') // Reduziere mehrfache Zeilenumbrüche auf maximal zwei
    .trim();

  // Text in die Zwischenablage kopieren
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

export const copyFormattedContent = (contentOrOnSuccess, onSuccessOrOnError, onError) => {
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

  console.log('Kopiervorgang startet mit:', { 
    contentProvided: !!content,
    contentType: typeof content,
    hasOnSuccess: !!onSuccess,
    hasOnError: !!onErrorCallback 
  });

  try {
    // Use the centralized content extractor for consistent plain text output
    const plainText = extractPlainText(content);
    
    console.log('Formatierter Text erstellt:', plainText?.length, 'Zeichen');

    navigator.clipboard.writeText(plainText)
      .then(() => {
        console.log('Text erfolgreich in Zwischenablage kopiert');
        if (onSuccess) {
          onSuccess();
        }
      })
      .catch(err => {
        console.error('Fehler beim Kopieren:', err);
        if (onErrorCallback) {
          onErrorCallback(err);
        }
      });
  } catch (err) {
    console.error('Fehler bei der Textextraktion:', err);
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
