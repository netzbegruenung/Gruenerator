// gruenerator_backend/routes/subtitler/services/tusService.js
const { Server } = require('@tus/server');
const { FileStore } = require('@tus/file-store');
const path = require('path');
const fs = require('fs').promises;

// Konfiguriere Tus Upload Verzeichnis
const TUS_UPLOAD_PATH = path.join(__dirname, '../../../uploads/tus-temp');

// Erstelle Upload-Verzeichnis falls es nicht existiert
(async () => {
  try {
    await fs.mkdir(TUS_UPLOAD_PATH, { recursive: true });
    console.log('Tus Upload Verzeichnis erstellt:', TUS_UPLOAD_PATH);
  } catch (err) {
    console.error('Fehler beim Erstellen des Tus Upload Verzeichnisses:', err);
  }
})();

console.log('[tusService] Initializing Tus Server configuration...'); // Log hinzufügen oder beibehalten

// Konfiguriere Tus Server
const tusServer = new Server({
  path: '/api/subtitler/upload',
  datastore: new FileStore({ directory: TUS_UPLOAD_PATH }),
  // Erlaube große Dateien (z.B. 500MB)
  maxSize: 500 * 1024 * 1024,
  respectForwardedHeaders: true,
});

// Event Handler für abgeschlossene Uploads
tusServer.on('upload-complete', (event) => {
  console.log('Tus Upload abgeschlossen:', event.upload);
});

// Hilfsfunktionen für den Controller
const getFilePathFromUploadId = (uploadId) => {
  if (!uploadId) throw new Error('Upload ID ist erforderlich');
  return path.join(TUS_UPLOAD_PATH, uploadId);
};

const checkFileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

// Optional: Funktion zum Aufräumen alter Upload-Dateien
const cleanupTusUploads = async (maxAgeHours = 24) => {
  try {
    const files = await fs.readdir(TUS_UPLOAD_PATH);
    const now = Date.now();
    
    for (const file of files) {
      // Skip the .gitkeep file
      if (file === '.gitkeep') {
        continue;
      }

      const filePath = path.join(TUS_UPLOAD_PATH, file);
      const stats = await fs.stat(filePath);
      const ageHours = (now - stats.mtime.getTime()) / (1000 * 60 * 60);
      
      if (ageHours > maxAgeHours) {
        await fs.unlink(filePath);
        console.log('Alte Tus Upload-Datei gelöscht:', file);
      }
    }
  } catch (err) {
    console.error('Fehler beim Aufräumen der Tus Uploads:', err);
  }
};

// Start cleanup immediately on server start
cleanupTusUploads();

// Schedule cleanup every 24 hours
const cleanupInterval = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
setInterval(cleanupTusUploads, cleanupInterval);

module.exports = {
  tusServer,
  getFilePathFromUploadId,
  checkFileExists,
  cleanupTusUploads
};