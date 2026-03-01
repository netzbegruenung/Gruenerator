import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import {
  extractTextWithDocling,
  isDoclingAvailable,
} from '../../../../services/OcrService/doclingIntegration.js';
import { OCRService } from '../../../../services/OcrService/OcrService.js';
import { createLogger } from '../../../../utils/logger.js';

import type { FlyerToSiteState } from '../types.js';

const log = createLogger('FlyerToSite:extract');

export async function extractNode(state: FlyerToSiteState): Promise<Partial<FlyerToSiteState>> {
  const startTime = Date.now();
  const tempPath = path.join(os.tmpdir(), `flyer-${Date.now()}-${state.originalFilename}`);

  try {
    await fs.writeFile(tempPath, state.pdfBuffer);
    log.debug('Temp file written', { tempPath, size: state.pdfBuffer.length });

    const doclingUp = await isDoclingAvailable();

    if (doclingUp) {
      log.debug('Using Docling OCR');
      try {
        const result = await extractTextWithDocling(tempPath);
        return {
          extractedText: result.text,
          extractionResult: result,
          extractTimeMs: Date.now() - startTime,
        };
      } catch (doclingErr) {
        log.warn('Docling failed, falling back to Mistral OCR', {
          error: (doclingErr as Error).message,
        });
      }
    } else {
      log.debug('Docling unavailable, using Mistral OCR');
    }

    const ocrService = new OCRService();
    const result = await ocrService.extractTextFromDocument(tempPath);

    if (!result.text?.trim()) {
      return {
        extractedText: null,
        extractionResult: null,
        extractTimeMs: Date.now() - startTime,
        error: 'Der Flyer enthält keinen lesbaren Text. Bitte lade eine andere Datei hoch.',
      };
    }

    return {
      extractedText: result.text,
      extractionResult: result,
      extractTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    log.error('Text extraction failed', { error: (err as Error).message });
    return {
      extractedText: null,
      extractionResult: null,
      extractTimeMs: Date.now() - startTime,
      error: `Textextraktion fehlgeschlagen: ${(err as Error).message}`,
    };
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}
