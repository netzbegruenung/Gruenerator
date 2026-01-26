import axios from 'axios';
import { useEffect } from 'react';

import useGeneratedTextStore from '../../stores/core/generatedTextStore';

import {
  extractPlainText as extractPlainTextJs,
  extractHTMLContent as extractHTMLContentJs,
} from './contentExtractor';

// Type assertions for JS functions that return Promises
const extractPlainText = extractPlainTextJs as (content: unknown) => Promise<string>;
const extractHTMLContent = extractHTMLContentJs as (content: unknown) => Promise<string>;

// Type definitions
type SetStateAction<T> = T | ((prevState: T) => T);
type Dispatch<T> = (value: SetStateAction<T>) => void;

interface FormDataRecord {
  [key: string]: unknown;
}

// Function to handle form changes
export const handleChange = (
  e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  setFormData: Dispatch<FormDataRecord>
): void => {
  const { name, value } = e.target;
  setFormData((prevData: FormDataRecord) => ({
    ...prevData,
    [name]: value,
  }));
};

// Function to submit forms and process the response
export const handleSubmit = async (
  url: string,
  formData: unknown,
  setGeneratedText: (text: string) => void,
  setLoading: (loading: boolean) => void
): Promise<void> => {
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
export const handleCopyToClipboard = (text: string): void => {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      console.log('Text copied to clipboard');
    })
    .catch((err: unknown) => {
      console.error('Failed to copy text: ', err);
    });
};

// DEPRECATED: Use copyFormattedContent instead
export const copyPlainText = (htmlContent: string): void => {
  console.warn('copyPlainText is deprecated. Use copyFormattedContent instead.');

  // Fallback implementation for backward compatibility
  const tempElement = document.createElement('div');
  tempElement.innerHTML = htmlContent;
  const plainText = tempElement.innerText.trim();

  navigator.clipboard
    .writeText(plainText)
    .then(() => {
      console.log('Formatierter Text erfolgreich in die Zwischenablage kopiert.');
    })
    .catch((err: unknown) => {
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

export const useScrollRestoration = (): void => {
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }, []);
};

// File handling functions
export const handleFileChange = (
  e: React.ChangeEvent<HTMLInputElement>,
  setFile: (file: File | null) => void,
  setFileName: (name: string) => void
): void => {
  const file = e.target.files?.[0] ?? null;
  setFile(file);
  setFileName(file ? file.name : '');
};

export const handleDragEnter = (
  e: React.DragEvent<HTMLElement>,
  setDragging: (dragging: boolean) => void
): void => {
  e.preventDefault();
  setDragging(true);
};

export const handleDragLeave = (
  e: React.DragEvent<HTMLElement>,
  setDragging: (dragging: boolean) => void
): void => {
  e.preventDefault();
  setDragging(false);
};

export const handleDragOver = (e: React.DragEvent<HTMLElement>): void => {
  e.preventDefault();
};

export const handleDrop = (
  e: React.DragEvent<HTMLElement>,
  setDragging: (dragging: boolean) => void,
  setFile: (file: File | null) => void,
  setFileName: (name: string) => void
): void => {
  e.preventDefault();
  const file = e.dataTransfer.files[0] ?? null;
  setFile(file);
  setFileName(file ? file.name : '');
  setDragging(false);
};

// Type for callback functions
type SuccessCallback = () => void;
type ErrorCallback = (error: unknown) => void;

export const copyFormattedContent = async (
  contentOrOnSuccess?: string | SuccessCallback,
  onSuccessOrOnError?: SuccessCallback | ErrorCallback,
  onError?: ErrorCallback
): Promise<void> => {
  // Handle backward compatibility: if first param is a function, use old signature
  let content: string;
  let onSuccess: SuccessCallback | undefined;
  let onErrorCallback: ErrorCallback | undefined;

  if (typeof contentOrOnSuccess === 'function') {
    // Old signature: copyFormattedContent(onSuccess, onError)
    onSuccess = contentOrOnSuccess;
    onErrorCallback = onSuccessOrOnError as ErrorCallback | undefined;
    const store = useGeneratedTextStore.getState();
    // Get the first available generated text for backward compatibility
    const textKeys = Object.keys(store.generatedTexts);
    const storedContent = textKeys.length > 0 ? store.getGeneratedText(textKeys[0]) : '';
    // StoredContent can be string or object, convert to string if needed
    content = typeof storedContent === 'string' ? storedContent : JSON.stringify(storedContent);
  } else {
    // New signature: copyFormattedContent(content, onSuccess, onError)
    content = contentOrOnSuccess ?? '';
    onSuccess = onSuccessOrOnError as SuccessCallback | undefined;
    onErrorCallback = onError;
  }

  try {
    // Use the centralized content extractor for consistent output
    const plainText = await extractPlainText(content);

    // For rich clipboard support, try to write both HTML and plain text
    if (navigator.clipboard && navigator.clipboard.write) {
      try {
        // Get HTML version using existing export structure
        const htmlContent = await extractHTMLContent(content);

        // Create clipboard items with both formats
        const clipboardItems = [
          new ClipboardItem({
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
          }),
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

interface SearchContentObject {
  analysis: string;
}

export const formatQuillContent = (content: string | SearchContentObject): string => {
  // Prüfe ob es sich um einen Suchseiten-Export handelt
  if (typeof content === 'object' && content.analysis) {
    return content.analysis;
  }

  // Temporäres Element für die Formatierung
  const tempElement = document.createElement('div');
  tempElement.innerHTML = content as string;

  // Formatiere Block-Elemente
  const blockElements = tempElement.querySelectorAll(
    'p, div, li, h1, h2, h3, h4, h5, h6, blockquote'
  );
  blockElements.forEach((element) => {
    // Fügt Zeilenumbrüche nach Block-Elementen ein
    element.insertAdjacentHTML('afterend', '\n');

    // Spezielle Behandlung für Listenelemente
    if (element.tagName === 'LI') {
      element.insertAdjacentHTML('beforebegin', '• ');
    }
  });

  // Doppelte Zeilenumbrüche für bessere Lesbarkeit
  const lists = tempElement.querySelectorAll('ul, ol');
  lists.forEach((list) => {
    list.insertAdjacentHTML('afterend', '\n');
  });

  // Erhalte die HTML-Struktur
  return tempElement.innerHTML;
};
