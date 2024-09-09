const fs = require('fs').promises;
const { registerFont } = require('canvas');
const { FONT_PATH, SUNFLOWER_PATH, TESTBILD_PATH, TEMP_UPLOAD_DIR  } = require('./config');

async function checkFiles() {
  const files = [
    { path: FONT_PATH, name: 'Schriftartdatei' },
    { path: SUNFLOWER_PATH, name: 'Sonnenblumen-Bild' },
    { path: TESTBILD_PATH, name: 'Testbild' }
  ];

  for (const file of files) {
    try {
      await fs.access(file.path);
    } catch (err) {
      console.error(`Fehler beim Zugriff auf ${file.name}:`, err);
      throw new Error(`${file.name} nicht gefunden: ${file.path}`);
    }
  }
}

function registerFonts() {
  try {
    registerFont(FONT_PATH, { family: 'GrueneType' });
    console.log('Schriftart erfolgreich registriert:', FONT_PATH);
  } catch (err) {
    console.error('Fehler beim Registrieren der Schriftart:', err);
    throw err;
  }
}

module.exports = {
  checkFiles,
  registerFonts
};