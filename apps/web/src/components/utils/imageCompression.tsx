// browser-image-compression will be dynamically imported when needed

const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.8,              // Slightly more aggressive compression
  maxWidthOrHeight: 1920,      // maximale Breite/Höhe
  useWebWorker: true,          // nutzt Web Worker für bessere Performance
  preserveExif: false,         // Remove EXIF for smaller files (was true)
  initialQuality: 0.85,        // Slightly higher quality
  alwaysKeepResolution: false, // erlaubt Größenänderung wenn nötig
  fileType: 'image/webp'       // Use WebP format for better compression
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
 * Detect if browser supports WebP
 * @returns {boolean}
 */
const supportsWebP = () => {
  if (typeof window === 'undefined') return false;

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
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

    // Use WebP if supported, otherwise fall back to original format
    const useWebP = supportsWebP() && !customOptions.preserveFormat;
    const options = {
      ...COMPRESSION_OPTIONS,
      ...(useWebP ? {} : { fileType: imageFile.type }), // Keep original format if WebP not supported
      ...customOptions
    };

    const imageCompression = (await import('browser-image-compression')).default;
    const compressedFile = await imageCompression(imageFile, options);

    console.log('Bildkomprimierung abgeschlossen:', {
      originalSize: `${(imageFile.size / (1024 * 1024)).toFixed(2)}MB`,
      compressedSize: `${(compressedFile.size / (1024 * 1024)).toFixed(2)}MB`,
      compressionRatio: `${((1 - compressedFile.size / imageFile.size) * 100).toFixed(1)}%`,
      format: compressedFile.type
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
