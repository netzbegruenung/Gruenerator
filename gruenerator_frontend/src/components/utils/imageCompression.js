import imageCompression from 'browser-image-compression';

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1,              // maximale Dateigröße in MB
  maxWidthOrHeight: 1920,    // maximale Breite/Höhe
  useWebWorker: true,        // nutzt Web Worker für bessere Performance
  preserveExif: true,        // behält EXIF-Daten
  initialQuality: 0.8,       // initiale Qualität
  alwaysKeepResolution: false // erlaubt Größenänderung wenn nötig
};

/**
 * Prüft ob eine Datei ein Bild ist
 * @param {File} file - Die zu prüfende Datei
 * @returns {boolean}
 */
const isImage = (file) => {
  return file && file.type.startsWith('image/');
};

/**
 * Komprimiert ein Bild mit optimierten Einstellungen
 * @param {File} imageFile - Die Bilddatei
 * @param {Object} customOptions - Optionale benutzerdefinierte Komprimierungsoptionen
 * @returns {Promise<File>} - Die komprimierte Datei
 * @throws {Error} - Wenn die Datei kein Bild ist oder die Komprimierung fehlschlägt
 */
export const compressImage = async (imageFile, customOptions = {}) => {
  try {
    if (!isImage(imageFile)) {
      throw new Error('Die ausgewählte Datei ist kein Bild');
    }

    console.log('Starte Bildkomprimierung:', {
      originalSize: `${(imageFile.size / (1024 * 1024)).toFixed(2)}MB`,
      type: imageFile.type
    });

    const options = {
      ...COMPRESSION_OPTIONS,
      ...customOptions
    };

    const compressedFile = await imageCompression(imageFile, options);

    console.log('Bildkomprimierung abgeschlossen:', {
      originalSize: `${(imageFile.size / (1024 * 1024)).toFixed(2)}MB`,
      compressedSize: `${(compressedFile.size / (1024 * 1024)).toFixed(2)}MB`,
      compressionRatio: `${((1 - compressedFile.size / imageFile.size) * 100).toFixed(1)}%`
    });

    return compressedFile;
  } catch (error) {
    console.error('Fehler bei der Bildkomprimierung:', error);
    throw new Error(`Bildkomprimierung fehlgeschlagen: ${error.message}`);
  }
};

/**
 * Verarbeitet eine Bilddatei für den Upload
 * @param {File} file - Die zu verarbeitende Datei
 * @param {Object} options - Optionale Komprimierungsoptionen
 * @returns {Promise<File>} - Die verarbeitete Datei
 */
export const processImageForUpload = async (file, options = {}) => {
  try {
    if (!file) {
      throw new Error('Keine Datei ausgewählt');
    }

    // Prüfe ob Komprimierung notwendig ist
    if (file.size <= (options.maxSizeMB || COMPRESSION_OPTIONS.maxSizeMB) * 1024 * 1024) {
      console.log('Keine Komprimierung notwendig, Dateigröße ist bereits optimal');
      return file;
    }

    return await compressImage(file, options);
  } catch (error) {
    console.error('Fehler bei der Bildverarbeitung:', error);
    throw error;
  }
};

/**
 * Erstellt eine FormData-Instanz mit dem komprimierten Bild
 * @param {File} file - Die Bilddatei
 * @param {string} fieldName - Der Feldname für FormData (default: 'image')
 * @returns {Promise<FormData>}
 */
export const createImageFormData = async (file, fieldName = 'image') => {
  try {
    const processedImage = await processImageForUpload(file);
    const formData = new FormData();
    formData.append(fieldName, processedImage);
    return formData;
  } catch (error) {
    console.error('Fehler beim Erstellen von FormData:', error);
    throw error;
  }
};