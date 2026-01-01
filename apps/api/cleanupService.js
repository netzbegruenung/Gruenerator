import fs from 'fs/promises';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import path from 'path';

const TEMP_DIR = path.join(__dirname, '..', 'temp_uploads');
const FILE_EXPIRY = 60 * 60 * 1000; // 60 Minuten in Millisekunden

async function cleanupOldFiles() {
  try {
    const files = await fs.readdir(TEMP_DIR);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = await fs.stat(filePath);

      if (now - stats.mtime.getTime() > FILE_EXPIRY) {
        await fs.unlink(filePath);
        console.log(`Alte Datei gelöscht: ${file}`);
      }
    }
  } catch (err) {
    console.error('Fehler beim Bereinigen alter Dateien:', err);
  }
}

function startCleanupService(interval = 30 * 60 * 1000) {
  setInterval(cleanupOldFiles, interval);
  console.log('Cleanup-Service gestartet');
}

export { startCleanupService };