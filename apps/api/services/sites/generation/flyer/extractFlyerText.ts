import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { createLogger } from '../../../../utils/logger.js';
import { OCRService } from '../../../OcrService/index.js';
import { stripPageMarkers } from '../../../OcrService/pageMarkers.js';

const log = createLogger('Sites:flyerText');

export { FLYER_TEXT_MAX_CHARS } from './flyerTextLimit.js';

// Same route as chat attachments: text-native pages via pdfjs, only table pages and scans to OCR.
async function readPdf(tempPath: string): Promise<string> {
  const { text } = await new OCRService().extractTextFromDocument(tempPath, undefined, {
    pageMarkers: true,
  });
  return stripPageMarkers(text ?? '');
}

export async function extractFlyerText(pdf: Buffer): Promise<string> {
  const tempPath = path.join(os.tmpdir(), `flyer-${randomUUID()}.pdf`);
  try {
    await fs.writeFile(tempPath, pdf);
    return (await readPdf(tempPath)).trim();
  } catch (cause) {
    log.error('Flyer text extraction failed', { error: (cause as Error).message });
    throw new Error('flyer extraction failed', { cause });
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}
