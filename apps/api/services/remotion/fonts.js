import path from 'path';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


const FONTS_DIR = path.resolve(__dirname, '../../public/fonts');

const fontDefinitions = [
  {
    family: 'GrueneTypeNeue',
    file: 'GrueneTypeNeue-Regular.ttf',
    weight: '400'
  },
  {
    family: 'GrueneType Neue',
    file: 'GrueneTypeNeue-Regular.ttf',
    weight: '400'
  },
  {
    family: 'PTSans',
    file: 'PTSans-Regular.ttf',
    weight: '400'
  },
  {
    family: 'PT Sans',
    file: 'PTSans-Regular.ttf',
    weight: '400'
  },
  {
    family: 'PTSans',
    file: 'PTSans-Bold.ttf',
    weight: '700'
  },
  {
    family: 'GJFontRegular',
    file: 'GJFontRegular.ttf',
    weight: '400'
  },
  {
    family: 'Wix Madefor Display',
    file: 'GJFontRegular.ttf',
    weight: '400'
  },
  {
    family: 'Montserrat',
    file: 'Montserrat-Bold.ttf',
    weight: '700'
  }
];

async function loadAllFonts() {
  const fontPaths = getAllFontPaths();
  const results = [];

  for (const fontPath of fontPaths) {
    const { default: fs } = await import('fs/promises');
    try {
      await fs.access(fontPath);
      results.push({ path: fontPath, success: true });
    } catch {
      results.push({ path: fontPath, success: false });
    }
  }

  const loaded = results.filter(r => r.success).map(r => r.path);
  const failed = results.filter(r => !r.success).map(r => r.path);

  if (failed.length > 0) {
    console.warn('Some font files not found:', failed);
  }

  return { loaded, failed };
}

function getFontPath(fontFamily) {
  const font = fontDefinitions.find(f => f.family === fontFamily);
  if (font) {
    return path.join(FONTS_DIR, font.file);
  }
  return path.join(FONTS_DIR, 'GrueneTypeNeue-Regular.ttf');
}

function getAllFontPaths() {
  const uniqueFiles = [...new Set(fontDefinitions.map(f => f.file))];
  return uniqueFiles.map(file => path.join(FONTS_DIR, file));
}

export { loadAllFonts, getFontPath, getAllFontPaths, fontDefinitions, FONTS_DIR };