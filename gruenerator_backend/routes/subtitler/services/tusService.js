// gruenerator_backend/routes/subtitler/services/tusService.js
const { Server } = require('@tus/server');
const { FileStore } = require('@tus/file-store');
const path = require('path');
const fs = require('fs').promises;
const { sanitizePath } = require('../../../utils/securityUtils');
const { createLogger } = require('../../../utils/logger.js');
const log = createLogger('TusService');

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
    log.debug(`Upload directory: ${TUS_UPLOAD_PATH}`);
  } catch (err) {
    log.error(`Failed to create upload directory: ${err.message}`);
  }
})();

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
        log.debug(`Metadata read error for ${uploadId}: ${err.message}`);
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
    log.debug(`Upload status error for ${uploadId}: ${err.message}`);
    return { exists: false, error: true };
  }
};

const cleanupUploadFiles = async (uploadId, reason = 'TTL expired') => {
  try {
    const metadataPath = path.join(TUS_UPLOAD_PATH, `${uploadId}.json`);
    const videoPath = path.join(TUS_UPLOAD_PATH, uploadId);

    await Promise.all([
      fs.unlink(metadataPath).catch(() => {}),
      fs.unlink(videoPath).catch(() => {})
    ]);

    activeUploads.delete(uploadId);
    processedUploads.delete(uploadId);

    log.debug(`Cleaned up ${uploadId} (${reason})`);
    return true;
  } catch (err) {
    log.debug(`Cleanup error for ${uploadId}: ${err.message}`);
    return false;
  }
};

const markUploadAsProcessed = (uploadId) => {
  activeUploads.delete(uploadId);
  processedUploads.add(uploadId);
};

const scheduleImmediateCleanup = async (uploadId, reason = 'immediate') => {
  setTimeout(async () => {
    await cleanupUploadFiles(uploadId, reason);
  }, 5000);
};

// Event-basiertes sofortiges Cleanup
tusServer.on('upload-create', (event) => {
  activeUploads.add(event.upload.id);
});

tusServer.on('upload-complete', (event) => {
  markUploadAsProcessed(event.upload.id);
});

tusServer.on('upload-abort', (event) => {
  scheduleImmediateCleanup(event.upload.id, 'aborted');
});

tusServer.on('upload-error', (event) => {
  scheduleImmediateCleanup(event.upload.id, 'error');
});

// Intelligentes TTL-basiertes Cleanup (non-blocking with batching)
const CLEANUP_BATCH_SIZE = 10;

const intelligentCleanup = async () => {
  try {
    const files = await fs.readdir(TUS_UPLOAD_PATH);
    const now = Date.now();
    let cleanedCount = 0;

    // Filter out .gitkeep and get unique upload IDs
    const uploadIds = [...new Set(
      files
        .filter(file => file !== '.gitkeep')
        .map(file => file.endsWith('.json') ? file.slice(0, -5) : file)
    )];

    // Process in batches to avoid blocking the event loop
    for (let i = 0; i < uploadIds.length; i += CLEANUP_BATCH_SIZE) {
      const batch = uploadIds.slice(i, i + CLEANUP_BATCH_SIZE);

      const results = await Promise.all(batch.map(async (uploadId) => {
        try {
          const filePath = path.join(TUS_UPLOAD_PATH, uploadId);
          const stats = await fs.stat(filePath).catch(() => null);
          if (!stats) return false;

          const fileAge = now - stats.mtime.getTime();
          const status = await getUploadStatus(uploadId);

          if (!status.exists) return false;

          let shouldCleanup = false;
          let reason = '';

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
            return await cleanupUploadFiles(uploadId, reason);
          }
          return false;
        } catch {
          return false;
        }
      }));

      cleanedCount += results.filter(Boolean).length;

      // Yield to event loop between batches to prevent blocking uploads
      if (i + CLEANUP_BATCH_SIZE < uploadIds.length) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    if (cleanedCount > 0) log.debug(`Cleanup: ${cleanedCount} files removed`);
  } catch (err) {
    log.debug(`Cleanup error: ${err.message}`);
  }
};

// Emergency Cleanup (aggressiver, non-blocking with batching)
const emergencyCleanup = async () => {
  try {
    const files = await fs.readdir(TUS_UPLOAD_PATH);
    const now = Date.now();
    let cleanedCount = 0;

    // Filter out .gitkeep and get unique upload IDs
    const uploadIds = [...new Set(
      files
        .filter(file => file !== '.gitkeep')
        .map(file => file.endsWith('.json') ? file.slice(0, -5) : file)
    )];

    // Process in batches to avoid blocking the event loop
    for (let i = 0; i < uploadIds.length; i += CLEANUP_BATCH_SIZE) {
      const batch = uploadIds.slice(i, i + CLEANUP_BATCH_SIZE);

      const results = await Promise.all(batch.map(async (uploadId) => {
        try {
          const filePath = path.join(TUS_UPLOAD_PATH, uploadId);
          const stats = await fs.stat(filePath).catch(() => null);
          if (!stats) return false;

          const fileAge = now - stats.mtime.getTime();

          if (fileAge > TUS_CLEANUP_CONFIG.MAX_FILE_AGE / 2) {
            return await cleanupUploadFiles(uploadId, 'emergency');
          }
          return false;
        } catch {
          return false;
        }
      }));

      cleanedCount += results.filter(Boolean).length;

      // Yield to event loop between batches
      if (i + CLEANUP_BATCH_SIZE < uploadIds.length) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    if (cleanedCount > 0) log.debug(`Emergency cleanup: ${cleanedCount} files removed`);
  } catch (err) {
    log.debug(`Emergency cleanup error: ${err.message}`);
  }
};

// Hilfsfunktionen für den Controller
const getFilePathFromUploadId = (uploadId) => {
  if (!uploadId) throw new Error('Upload ID ist erforderlich');

  try {
    return sanitizePath(uploadId, TUS_UPLOAD_PATH);
  } catch (error) {
    log.warn(`Security validation failed for uploadId: ${uploadId}`);
    throw new Error('Invalid upload ID: security validation failed');
  }
};

const checkFileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

// Legacy Cleanup-Funktion
const cleanupTusUploads = async (maxAgeHours = 24) => {
  await intelligentCleanup();
};

// Starte initiales Cleanup beim Server-Start
if (!isInitialized) {
  intelligentCleanup();

  cleanupIntervalId = setInterval(intelligentCleanup, TUS_CLEANUP_CONFIG.CLEANUP_INTERVAL);
  emergencyCleanupIntervalId = setInterval(emergencyCleanup, TUS_CLEANUP_CONFIG.EMERGENCY_CLEANUP_INTERVAL);

  log.debug('Cleanup intervals configured');

  const shutdownHandler = () => {
    if (cleanupIntervalId) {
      clearInterval(cleanupIntervalId);
      clearInterval(emergencyCleanupIntervalId);
      cleanupIntervalId = null;
      emergencyCleanupIntervalId = null;
    }
  };

  process.on('SIGTERM', shutdownHandler);
  process.on('SIGINT', shutdownHandler);

  isInitialized = true;
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