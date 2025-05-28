// gruenerator_backend/routes/subtitler/services/tusService.js
const { Server } = require('@tus/server');
const { FileStore } = require('@tus/file-store');
const path = require('path');
const fs = require('fs').promises;

// Singleton-Pattern um mehrfache Initialisierung zu verhindern
let isInitialized = false;
let cleanupIntervalId = null;
let emergencyCleanupIntervalId = null;

// Konfiguriere Tus Upload Verzeichnis
const TUS_UPLOAD_PATH = path.join(__dirname, '../../../uploads/tus-temp');

// Erweiterte Cleanup-Konfiguration
const TUS_CLEANUP_CONFIG = {
  INCOMPLETE_UPLOAD_TTL: 30 * 60 * 1000, // 30 Minuten für unvollständige Uploads
  PROCESSED_FILE_TTL: 4 * 60 * 60 * 1000, // 4 Stunden für verarbeitete Dateien
  ORPHANED_METADATA_TTL: 15 * 60 * 1000, // 15 Minuten für verwaiste Metadaten
  CLEANUP_INTERVAL: 15 * 60 * 1000, // 15 Minuten normales Cleanup
  EMERGENCY_CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 Stunde Emergency-Cleanup
  MAX_FILE_AGE: 24 * 60 * 60 * 1000 // 24 Stunden absolute Obergrenze
};

// Set für aktive Upload-IDs (zur Verfolgung des Status)
const activeUploads = new Set();
const processedUploads = new Set();

// Erstelle Upload-Verzeichnis falls es nicht existiert
(async () => {
  try {
    await fs.mkdir(TUS_UPLOAD_PATH, { recursive: true });
    console.log('[tusService] Tus Upload Verzeichnis erstellt:', TUS_UPLOAD_PATH);
  } catch (err) {
    console.error('[tusService] Fehler beim Erstellen des Tus Upload Verzeichnisses:', err);
  }
})();

console.log('[tusService] Initializing Hybrid File-Lifecycle Management...');

// Konfiguriere Tus Server
const tusServer = new Server({
  path: '/api/subtitler/upload',
  datastore: new FileStore({ directory: TUS_UPLOAD_PATH }),
  maxSize: 500 * 1024 * 1024,
  respectForwardedHeaders: true,
});

// Hilfsfunktionen für Upload-Status
const getUploadStatus = async (uploadId) => {
  try {
    const metadataPath = path.join(TUS_UPLOAD_PATH, `${uploadId}.json`);
    const videoPath = path.join(TUS_UPLOAD_PATH, uploadId);
    
    const [metadataExists, videoExists] = await Promise.all([
      fs.access(metadataPath).then(() => true).catch(() => false),
      fs.access(videoPath).then(() => true).catch(() => false)
    ]);

    if (!metadataExists && !videoExists) {
      return { exists: false };
    }

    let metadata = null;
    if (metadataExists) {
      try {
        const metadataContent = await fs.readFile(metadataPath, 'utf8');
        metadata = JSON.parse(metadataContent);
      } catch (err) {
        console.warn(`[tusService] Fehler beim Lesen der Metadaten für ${uploadId}:`, err);
      }
    }

    return {
      exists: true,
      hasMetadata: metadataExists,
      hasVideo: videoExists,
      isComplete: metadata ? metadata.offset >= metadata.size : false,
      isIncomplete: metadata ? metadata.offset < metadata.size : false,
      isOrphaned: metadataExists && !videoExists,
      metadata
    };
  } catch (err) {
    console.error(`[tusService] Fehler beim Ermitteln des Upload-Status für ${uploadId}:`, err);
    return { exists: false, error: true };
  }
};

const cleanupUploadFiles = async (uploadId, reason = 'TTL expired') => {
  try {
    const metadataPath = path.join(TUS_UPLOAD_PATH, `${uploadId}.json`);
    const videoPath = path.join(TUS_UPLOAD_PATH, uploadId);
    
    const cleanupPromises = [];
    
    // Lösche Metadaten-Datei
    cleanupPromises.push(
      fs.unlink(metadataPath).catch(err => {
        if (err.code !== 'ENOENT') {
          console.warn(`[tusService] Fehler beim Löschen der Metadaten ${uploadId}:`, err.message);
        }
      })
    );
    
    // Lösche Video-Datei
    cleanupPromises.push(
      fs.unlink(videoPath).catch(err => {
        if (err.code !== 'ENOENT') {
          console.warn(`[tusService] Fehler beim Löschen der Video-Datei ${uploadId}:`, err.message);
        }
      })
    );

    await Promise.all(cleanupPromises);
    
    // Entferne aus Sets
    activeUploads.delete(uploadId);
    processedUploads.delete(uploadId);
    
    console.log(`[tusService] Upload-Dateien gelöscht: ${uploadId} (Grund: ${reason})`);
    return true;
  } catch (err) {
    console.error(`[tusService] Fehler beim Cleanup von ${uploadId}:`, err);
    return false;
  }
};

const markUploadAsProcessed = (uploadId) => {
  activeUploads.delete(uploadId);
  processedUploads.add(uploadId);
  console.log(`[tusService] Upload als verarbeitet markiert: ${uploadId}`);
};

const scheduleImmediateCleanup = async (uploadId, reason = 'immediate') => {
  console.log(`[tusService] Sofortiges Cleanup geplant für ${uploadId} (${reason})`);
  // Kurze Verzögerung um sicherzustellen, dass alle Streams geschlossen sind
  setTimeout(async () => {
    await cleanupUploadFiles(uploadId, reason);
  }, 5000);
};

// Event-basiertes sofortiges Cleanup
tusServer.on('upload-create', (event) => {
  const uploadId = event.upload.id;
  activeUploads.add(uploadId);
  console.log(`[tusService] Upload erstellt: ${uploadId}`);
});

tusServer.on('upload-complete', (event) => {
  const uploadId = event.upload.id;
  console.log(`[tusService] Upload abgeschlossen: ${uploadId}`);
  markUploadAsProcessed(uploadId);
});

tusServer.on('upload-abort', (event) => {
  const uploadId = event.upload.id;
  console.log(`[tusService] Upload abgebrochen: ${uploadId}`);
  scheduleImmediateCleanup(uploadId, 'upload aborted');
});

tusServer.on('upload-error', (event) => {
  const uploadId = event.upload.id;
  console.log(`[tusService] Upload-Fehler: ${uploadId}`);
  scheduleImmediateCleanup(uploadId, 'upload error');
});

// Intelligentes TTL-basiertes Cleanup
const intelligentCleanup = async () => {
  try {
    console.log('[tusService] Starte intelligentes Cleanup...');
    const files = await fs.readdir(TUS_UPLOAD_PATH);
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const file of files) {
      if (file === '.gitkeep') continue;
      
      const filePath = path.join(TUS_UPLOAD_PATH, file);
      const stats = await fs.stat(filePath).catch(() => null);
      if (!stats) continue;
      
      const fileAge = now - stats.mtime.getTime();
      
      // Extrahiere Upload-ID (entferne .json Endung falls vorhanden)
      const uploadId = file.endsWith('.json') ? file.slice(0, -5) : file;
      
      // Ermittle Upload-Status
      const status = await getUploadStatus(uploadId);
      
      let shouldCleanup = false;
      let reason = '';
      
      if (!status.exists) {
        continue; // Datei existiert nicht mehr
      }
      
      // Verschiedene Cleanup-Strategien basierend auf Status
      if (status.isOrphaned && fileAge > TUS_CLEANUP_CONFIG.ORPHANED_METADATA_TTL) {
        shouldCleanup = true;
        reason = 'orphaned metadata';
      } else if (status.isIncomplete && fileAge > TUS_CLEANUP_CONFIG.INCOMPLETE_UPLOAD_TTL) {
        shouldCleanup = true;
        reason = 'incomplete upload TTL';
      } else if (processedUploads.has(uploadId) && fileAge > TUS_CLEANUP_CONFIG.PROCESSED_FILE_TTL) {
        shouldCleanup = true;
        reason = 'processed file TTL';
      } else if (fileAge > TUS_CLEANUP_CONFIG.MAX_FILE_AGE) {
        shouldCleanup = true;
        reason = 'maximum age exceeded';
      }
      
      if (shouldCleanup) {
        const success = await cleanupUploadFiles(uploadId, reason);
        if (success) cleanedCount++;
      }
    }
    
    console.log(`[tusService] Intelligentes Cleanup abgeschlossen. ${cleanedCount} Dateien bereinigt.`);
  } catch (err) {
    console.error('[tusService] Fehler beim intelligenten Cleanup:', err);
  }
};

// Emergency Cleanup (aggressiver)
const emergencyCleanup = async () => {
  try {
    console.log('[tusService] Starte Emergency-Cleanup...');
    const files = await fs.readdir(TUS_UPLOAD_PATH);
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const file of files) {
      if (file === '.gitkeep') continue;
      
      const filePath = path.join(TUS_UPLOAD_PATH, file);
      const stats = await fs.stat(filePath).catch(() => null);
      if (!stats) continue;
      
      const fileAge = now - stats.mtime.getTime();
      
      // Emergency Cleanup: Lösche alles was älter als die Hälfte der maximalen Zeit ist
      if (fileAge > TUS_CLEANUP_CONFIG.MAX_FILE_AGE / 2) {
        const uploadId = file.endsWith('.json') ? file.slice(0, -5) : file;
        const success = await cleanupUploadFiles(uploadId, 'emergency cleanup');
        if (success) cleanedCount++;
      }
    }
    
    console.log(`[tusService] Emergency-Cleanup abgeschlossen. ${cleanedCount} Dateien bereinigt.`);
  } catch (err) {
    console.error('[tusService] Fehler beim Emergency-Cleanup:', err);
  }
};

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

// Legacy Cleanup-Funktion (vereinfacht, wird von intelligentCleanup ersetzt)
const cleanupTusUploads = async (maxAgeHours = 24) => {
  console.log('[tusService] Legacy Cleanup aufgerufen - weitergeleitet an intelligentCleanup');
  await intelligentCleanup();
};

// Starte initiales Cleanup beim Server-Start
if (!isInitialized) {
  console.log('[tusService] Starte initiales Cleanup...');
  intelligentCleanup();

  // Plane regelmäßige Cleanup-Zyklen
  cleanupIntervalId = setInterval(intelligentCleanup, TUS_CLEANUP_CONFIG.CLEANUP_INTERVAL);
  emergencyCleanupIntervalId = setInterval(emergencyCleanup, TUS_CLEANUP_CONFIG.EMERGENCY_CLEANUP_INTERVAL);

  console.log(`[tusService] Cleanup-Intervalle konfiguriert:
- Intelligent: alle ${TUS_CLEANUP_CONFIG.CLEANUP_INTERVAL / 60000} Minuten
- Emergency: alle ${TUS_CLEANUP_CONFIG.EMERGENCY_CLEANUP_INTERVAL / 60000} Minuten`);

  // Graceful Shutdown - nur einmal registrieren
  const shutdownHandler = () => {
    if (cleanupIntervalId) {
      console.log('[tusService] Stoppe Cleanup-Intervalle...');
      clearInterval(cleanupIntervalId);
      clearInterval(emergencyCleanupIntervalId);
      cleanupIntervalId = null;
      emergencyCleanupIntervalId = null;
    }
  };

  process.on('SIGTERM', shutdownHandler);
  process.on('SIGINT', shutdownHandler);
  
  isInitialized = true;
  console.log('[tusService] Initialisierung abgeschlossen.');
}

module.exports = {
  tusServer,
  getFilePathFromUploadId,
  checkFileExists,
  cleanupTusUploads,
  markUploadAsProcessed,
  scheduleImmediateCleanup,
  getUploadStatus,
  cleanupUploadFiles
};