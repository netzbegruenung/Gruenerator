const fs = require('fs').promises;
const { registerFont } = require('canvas');
const { FONT_PATH, PTSANS_REGULAR_PATH, PTSANS_BOLD_PATH, SUNFLOWER_PATH, TESTBILD_PATH, TEMP_UPLOAD_DIR  } = require('./config');
const { createLogger } = require('../../../utils/logger.js');
const log = createLogger('fileManagement');


async function checkFiles() {
  const files = [
    { path: FONT_PATH, name: 'GrueneTypeNeue Schriftartdatei' },
    { path: PTSANS_REGULAR_PATH, name: 'PTSans Regular Schriftartdatei' },
    { path: PTSANS_BOLD_PATH, name: 'PTSans Bold Schriftartdatei' },
    { path: SUNFLOWER_PATH, name: 'Sonnenblumen-Bild' }
  ];

  for (const file of files) {
    try {
      await fs.access(file.path);
    } catch (err) {
      log.error(`Fehler beim Zugriff auf ${file.name}:`, err);
      throw new Error(`${file.name} nicht gefunden: ${file.path}`);
    }
  }
}

function registerFonts() {
  const fs = require('fs');

  const fonts = [
    { path: FONT_PATH, family: 'GrueneTypeNeue', name: 'GrueneTypeNeue' },
    { path: PTSANS_REGULAR_PATH, family: 'PTSans-Regular', name: 'PTSans Regular' },
    { path: PTSANS_BOLD_PATH, family: 'PTSans-Bold', name: 'PTSans Bold' }
  ];

  for (const font of fonts) {
    try {
      registerFont(font.path, { family: font.family });
    } catch (err) {
      log.error(`Fehler beim Registrieren der ${font.name} Schriftart:`, err);
      throw err;
    }
  }
}

module.exports = {
  checkFiles,
  registerFonts
};