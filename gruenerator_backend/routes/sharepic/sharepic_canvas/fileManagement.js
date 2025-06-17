const fs = require('fs').promises;
const { registerFont } = require('canvas');
const { FONT_PATH, SUNFLOWER_PATH, TESTBILD_PATH, TEMP_UPLOAD_DIR  } = require('./config');

async function checkFiles() {
  const files = [
    { path: FONT_PATH, name: 'Schriftartdatei' },
    { path: SUNFLOWER_PATH, name: 'Sonnenblumen-Bild' }
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
    console.log('Attempting to register font from:', FONT_PATH);
    registerFont(FONT_PATH, { family: 'GrueneType' });
    console.log('Schriftart erfolgreich registriert:', FONT_PATH);
    
    // Verify the font file exists and is readable
    const fs = require('fs');
    const stats = fs.statSync(FONT_PATH);
    console.log('Font file stats:', {
      size: stats.size,
      isFile: stats.isFile(),
      readable: fs.constants.R_OK
    });
  } catch (err) {
    console.error('Fehler beim Registrieren der Schriftart:', err);
    throw err;
  }
}

module.exports = {
  checkFiles,
  registerFonts
};