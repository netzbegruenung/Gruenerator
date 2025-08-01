const fs = require('fs').promises;
const { registerFont } = require('canvas');
const { FONT_PATH, PTSANS_REGULAR_PATH, PTSANS_BOLD_PATH, SUNFLOWER_PATH, TESTBILD_PATH, TEMP_UPLOAD_DIR  } = require('./config');

async function checkFiles() {
  const files = [
    { path: FONT_PATH, name: 'GrueneType Schriftartdatei' },
    { path: PTSANS_REGULAR_PATH, name: 'PTSans Regular Schriftartdatei' },
    { path: PTSANS_BOLD_PATH, name: 'PTSans Bold Schriftartdatei' },
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
  const fs = require('fs');
  
  const fonts = [
    { path: FONT_PATH, family: 'GrueneType', name: 'GrueneType' },
    { path: PTSANS_REGULAR_PATH, family: 'PTSans-Regular', name: 'PTSans Regular' },
    { path: PTSANS_BOLD_PATH, family: 'PTSans-Bold', name: 'PTSans Bold' }
  ];

  for (const font of fonts) {
    try {
      console.log(`Attempting to register ${font.name} font from:`, font.path);
      registerFont(font.path, { family: font.family });
      console.log(`${font.name} erfolgreich registriert:`, font.path);
      
      // Verify the font file exists and is readable
      const stats = fs.statSync(font.path);
      console.log(`${font.name} file stats:`, {
        size: stats.size,
        isFile: stats.isFile(),
        readable: fs.constants.R_OK
      });
    } catch (err) {
      console.error(`Fehler beim Registrieren der ${font.name} Schriftart:`, err);
      throw err;
    }
  }
}

module.exports = {
  checkFiles,
  registerFonts
};