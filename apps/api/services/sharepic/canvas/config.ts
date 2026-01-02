import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { CanvasColors, CanvasParams } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const FONT_PATH: string = path.resolve(__dirname, '../../../public/fonts/GrueneTypeNeue-Regular.ttf');
export const PTSANS_REGULAR_PATH: string = path.resolve(__dirname, '../../../public/fonts/PTSans-Regular.ttf');
export const PTSANS_BOLD_PATH: string = path.resolve(__dirname, '../../../public/fonts/PTSans-Bold.ttf');
export const SUNFLOWER_PATH: string = path.resolve(__dirname, '../../../public/Sonnenblume.png');
export const TESTBILD_PATH: string = path.resolve(__dirname, '../../../public/testbild.jpg');
export const TEMP_UPLOAD_DIR: string = path.resolve(__dirname, '../../../temp_uploads');

export const COLORS: CanvasColors = {
  TANNE: '#005538',
  KLEE: '#008939',
  GRASHALM: '#8ABD24',
  SAND: '#F5F1E9',
  HIMMEL: '#009EE3',
  ZITAT_BG: '#6ccd87'
};

export const params: CanvasParams = {
  CANVAS_SIZE: 1080,
  MIN_FONT_SIZE: 75,
  MAX_FONT_SIZE: 110,
  DEFAULT_FONT_SIZE: 75,
  DEFAULT_BALKEN_GRUPPEN_OFFSET: [30, 0],
  DEFAULT_BALKEN_OFFSET: [50, -100, 50],
  DEFAULT_SUNFLOWER_POSITION: 'bottomRight',
  DEFAULT_SUNFLOWER_OFFSET: [0, 0],
  DEFAULT_COLORS: [
    { background: '#005538', text: '#F5F1E9' },
    { background: '#F5F1E9', text: '#005538' },
    { background: '#F5F1E9', text: '#005538' }
  ],
  BALKEN_HEIGHT_FACTOR: 1.6,
  TEXT_PADDING_FACTOR: 0.3,
  SUNFLOWER_SIZE_FACTOR: 0.8,
  SUNFLOWER_OVERLAP_FACTOR: 0.25,
  OUTPUT_WIDTH: 1080,
  OUTPUT_HEIGHT: 1350,
  MAX_BALKEN_GRUPPEN_OFFSET: 300,
  MIN_BALKEN_GRUPPEN_OFFSET: -300,
  MAX_BALKEN_OFFSET: 300,
  MIN_BALKEN_OFFSET: -300,
  MAX_SUNFLOWER_OFFSET: 300,
  MIN_SUNFLOWER_OFFSET: -100
};
