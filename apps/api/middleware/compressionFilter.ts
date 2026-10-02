import compression from 'compression';
import { type Request, type Response } from 'express';

/**
 * Filter für `compression`: alles wie gehabt, nur SSE bleibt unkomprimiert.
 *
 * `compression` 1.8 wählt Brotli, sobald der Client `br` anbietet, und
 * `text/event-stream` gilt als komprimierbar. Browser dekodieren Brotli
 * inkrementell, Androids `expo/fetch` aber mit dem Java-Decoder
 * `org.brotli.dec`, der erst zurückkehrt, wenn sein 8-KB-Ausgabepuffer voll
 * oder der Stream zu Ende ist. Die App bekam deshalb jeden Chat-Turn erst
 * komplett am Ende; Statuszeile, Tool-Karten und Reasoning kamen nie live an.
 * Verloren geht wenig: die SSE-Writer flushen pro Event, da komprimiert
 * Brotli ohnehin kaum. Hier und nicht im `SSEWriter`, weil elf Routen SSE
 * schreiben und nur der Chat dessen `initHeaders` nutzt.
 */
export function shouldCompress(req: Request, res: Response): boolean {
  if (req.headers['x-no-compression']) {
    return false;
  }
  const contentType = res.getHeader('Content-Type');
  if (typeof contentType === 'string' && contentType.startsWith('text/event-stream')) {
    return false;
  }
  return compression.filter(req, res);
}
