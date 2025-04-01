import { useEffect, useRef } from 'react';
import { PROTECTED_HEADERS } from '../utils/constants';

const useProtectedHeaders = (quillRef, updateValue, localValue, setLocalValue, isEditing) => {
  const prevLocalValue = useRef('');

  useEffect(() => {
    if (quillRef.current) {
      const quill = quillRef.current;
      let lastProtectedHeaders = {};
      
      // Initial geschützte Header speichern
      const text = quill.getText();
      const lines = text.split('\n');
      lines.forEach((line, index) => {
        PROTECTED_HEADERS.forEach(header => {
          if (line.trim().toUpperCase() === header) {
            lastProtectedHeaders[index] = line;
          }
        });
      });
      
      quill.on('text-change', (delta, oldDelta, source) => {
        if (source === 'user') {
          const currentText = quill.getText();
          const currentLines = currentText.split('\n');
          let offset = 0;
          let hasHeaderChanges = false;
          let contentChanged = false;
          
          // Sammle alle existierenden Header
          const existingHeaders = new Set();
          currentLines.forEach(line => {
            PROTECTED_HEADERS.forEach(header => {
              if (line.trim().toUpperCase() === header) {
                existingHeaders.add(header);
              }
            });
          });
          
          // Für jede Zeile prüfen
          currentLines.forEach((line, index) => {
            // Prüfen ob diese Zeile ein geschützter Header war
            if (lastProtectedHeaders[index]) {
              const originalHeader = lastProtectedHeaders[index];
              // Nur wiederherstellen wenn der Header nicht schon existiert
              if (line.trim().toUpperCase() !== originalHeader.trim().toUpperCase() && 
                  !existingHeaders.has(originalHeader.trim().toUpperCase())) {
                // Nur den Header wiederherstellen
                const start = offset;
                hasHeaderChanges = true;
                
                // Header wiederherstellen
                quill.deleteText(start, line.length);
                // Temporarily remove inline styles to test restoration in Quill 2.0
                // quill.insertText(start, originalHeader, {
                //   'color': '#000000',
                //   'background': '#f0f0f0'
                // });
                quill.insertText(start, originalHeader); // Insert without formatting for testing
                existingHeaders.add(originalHeader.trim().toUpperCase());
              }
            }
            
            // Offset für nächste Zeile aktualisieren
            offset += line.length + 1; // +1 für den Zeilenumbruch
          });
          
          const newContent = quill.root.innerHTML;
          contentChanged = newContent !== localValue;
          
          // Nur aktualisieren wenn Header geändert wurden oder der Inhalt sich wirklich geändert hat
          if (hasHeaderChanges || contentChanged) {
            // Neue geschützte Header speichern
            const newHeaders = {};
            const newLines = quill.getText().split('\n');
            let hasValidContent = false;
            
            // Entferne doppelte Header
            const seenHeaders = new Set();
            newLines.forEach((line, index) => {
              PROTECTED_HEADERS.forEach(header => {
                if (line.trim().toUpperCase() === header) {
                  if (!seenHeaders.has(header)) {
                    newHeaders[index] = line;
                    seenHeaders.add(header);
                  } else {
                    // Lösche doppelte Header
                    const start = offset;
                    quill.deleteText(start, line.length + 1);
                    hasHeaderChanges = true;
                  }
                } else if (line.trim().length > 0) {
                  hasValidContent = true;
                }
              });
            });
            
            // Nur aktualisieren wenn es gültigen Inhalt gibt
            if (hasValidContent) {
              lastProtectedHeaders = newHeaders;
              const finalContent = quill.root.innerHTML;
              if (finalContent !== localValue) {
                setLocalValue(finalContent);
                updateValue(finalContent);
              }
            }
          }
        }
      });
    }
  }, [quillRef, updateValue, localValue, setLocalValue]);

  // Modifiziere den Platform-Container Wiederherstellungs-Effect
  useEffect(() => {
    if (!isEditing && localValue) {
      const containsPlatformHeaders = PROTECTED_HEADERS.some(header => 
        localValue.toUpperCase().includes(header)
      );
      
      if (containsPlatformHeaders && localValue !== prevLocalValue.current) {
        prevLocalValue.current = localValue;
        // Prüfe ob der Inhalt nicht leer ist
        const textContent = localValue.replace(/<[^>]*>/g, '').trim();
        if (textContent.length > 0) {
          setLocalValue(localValue);
          updateValue(localValue);
        }
      }
    }
  }, [isEditing, localValue, updateValue, setLocalValue]);

  return { PROTECTED_HEADERS };
};

export default useProtectedHeaders; 