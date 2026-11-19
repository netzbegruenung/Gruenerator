import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import {
  extractTextWithDocling,
  isDoclingAvailable,
} from '../../../OcrService/doclingIntegration.js';
import { OCRService } from '../../../OcrService/OcrService.js';
import { createLogger } from '../../../../utils/logger.js';

const log = createLogger('Sites:flyerText');

export { FLYER_TEXT_MAX_CHARS } from './flyerTextLimit.js';

async function readPdf(tempPath: string): Promise<string> {
  if (await isDoclingAvailable()) {
    try {
      return (await extractTextWithDocling(tempPath)).text ?? '';
    } catch (err) {
      log.warn('Docling failed, falling back to Mistral OCR', { error: (err as Error).message });
    }
  }
  return (await new OCRService().extractTextFromDocument(tempPath)).text ?? '';
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
