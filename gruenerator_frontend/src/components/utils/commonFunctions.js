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
export const useDynamicTextSize = (text, baseSize = 1.2, minSize = 0.8, thresholds = [1000, 2000]) => {
  const [textSize, setTextSize] = useState(`${baseSize}em`);
  
  useEffect(() => {
    if (text === undefined || text === null) {
      console.log('Warning: text is undefined or null in useDynamicTextSize');
      return;
    }
    
    let newSize = baseSize;
    if (text.length > thresholds[1]) {
      newSize = minSize;
    } else if (text.length > thresholds[0]) {
      newSize = (baseSize - 0.2).toFixed(1);
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

export const copyFormattedContent = (content, onSuccess, onError) => {
  console.log('1. Kopiervorgang startet mit:', { 
    contentLength: content?.length,
    hasOnSuccess: !!onSuccess,
    hasOnError: !!onError 
  });

  // Prüfe ob es sich um einen Suchseiten-Export handelt
  const isSearchExport = typeof content === 'object' && content.analysis;
  
  if (isSearchExport) {
    // Formatiere den Suchseiten-Export
    let formattedText = content.analysis;
    
    // Bereinige den Haupttext
    formattedText = formattedText
      .replace(/<\/?[^>]+(>|$)/g, '')  // Entferne HTML-Tags
      .replace(/\n\s+•/g, '\n•')       // Entferne Leerzeichen vor Aufzählungspunkten
      .replace(/•\s+/g, '• ')          // Korrigiere Abstände nach Aufzählungspunkten
      .replace(/\n[ \t]+/g, '\n')      // Entferne Einrückungen am Zeilenanfang
      .replace(/[ \t]+/g, ' ')         // Reduziere mehrfache Leerzeichen
      .replace(/\n{2,}/g, '\n\n')      // Reduziere auf maximal eine Leerzeile
      .trim();

    // Füge Quellenempfehlungen hinzu
    if (content.sourceRecommendations?.length > 0) {
      formattedText += '\n\nQuellenempfehlungen:';
      content.sourceRecommendations.forEach(rec => {
        formattedText += `\n• ${rec.title} - ${rec.summary}`;
      });
    }
    
    // Füge weitere Quellen hinzu
    if (content.unusedSources?.length > 0) {
      formattedText += '\n\nWeitere relevante Quellen:';
      content.unusedSources.forEach(source => {
        formattedText += `\n• ${source.title}`;
      });
    }

    // Finale Bereinigung
    const cleanText = formattedText
      .replace(/\n[ \t]+/g, '\n')      // Entferne Einrückungen am Zeilenanfang
      .replace(/[ \t]+/g, ' ')         // Reduziere mehrfache Leerzeichen
      .replace(/•\s+/g, '• ')          // Korrigiere Aufzählungszeichen-Abstände
      .replace(/\n\s*\n(\s*• )/g, '\n$1')  // Entferne Leerzeilen vor Listenpunkten
      .replace(/(\n• [^\n]+)\n\s*\n(\s*• )/g, '$1\n$2')  // Entferne Leerzeilen zwischen Listenpunkten
      .replace(/\n{3,}/g, '\n\n')      // Maximal eine Leerzeile zwischen Abschnitten
      .trim();

    navigator.clipboard.writeText(cleanText)
      .then(() => {
        console.log('5. Suchseiten-Export erfolgreich kopiert');
        if (onSuccess) onSuccess();
      })
      .catch(err => {
        console.error('Fehler beim Kopieren des Suchseiten-Exports:', err);
        if (onError) onError(err);
      });
    return;
  }
  
  const quillEditor = document.querySelector('.ql-editor');
  console.log('2. Quill Editor gefunden:', !!quillEditor);
  
  if (quillEditor) {
    // Hole den aktuellen HTML-Inhalt direkt aus dem Editor
    const currentContent = quillEditor.innerHTML;
    console.log('3. Aktueller Editor-Inhalt geholt:', currentContent?.length);
    
    // Temporäres Element für die Formatierung
    const tempElement = document.createElement('div');
    tempElement.innerHTML = currentContent;
    
    // Formatiere Block-Elemente
    const blockElements = tempElement.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, blockquote');
    blockElements.forEach(element => {
      element.insertAdjacentHTML('afterend', '\n');
      if (element.tagName === 'LI') {
        element.insertAdjacentHTML('beforebegin', '• ');
      }
    });

    // Formatiere Listen
    const lists = tempElement.querySelectorAll('ul, ol');
    lists.forEach(list => {
      list.insertAdjacentHTML('afterend', '\n');
    });

    // Extrahiere und bereinige den Text
    const cleanText = tempElement.innerText
      .replace(/\n{2,}/g, '\n')       // Reduziere mehrfache Zeilenumbrüche auf einen
      .replace(/•\s+/g, '• ')         // Korrigiere Aufzählungszeichen-Abstände
      .trim();
      
    console.log('4. Formatierter Text erstellt:', cleanText);

    navigator.clipboard.writeText(cleanText)
      .then(() => {
        console.log('5. Text erfolgreich in Zwischenablage kopiert');
        if (onSuccess) {
          console.log('6. onSuccess Callback wird aufgerufen');
          onSuccess();
        }
      })
      .catch(err => {
        console.error('5. Fehler beim Kopieren:', err);
        console.log('Fallback wird verwendet');
        copyPlainText(content);
        if (onError) {
          console.log('6. onError Callback wird aufgerufen');
          onError(err);
        }
      });
  } else {
    console.log('2b. Kein Quill Editor gefunden, verwende Fallback');
    copyPlainText(content);
    if (onSuccess) {
      console.log('3b. onSuccess Callback wird aufgerufen (Fallback)');
      onSuccess();
    }
  }
};
