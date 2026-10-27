/**
 * `website_erkunden`: a real browser (`services/browser-agent`) operates a
 * website on the person's behalf — click, search, decline cookie banners, save
 * screenshots — and the chat watches it live.
 *
 * Every step's frame and every saved screenshot is written to the compute-asset
 * store here; the stream and the persisted metadata carry only the
 * authenticated URLs. The session lands on `state.browserSession`, which
 * postResponseService persists as `metadata.browserSession`.
 *
 * Order of the gates: URL check, then the hourly budget, then the service. A
 * refused URL therefore costs no budget, and nothing at all reaches the
 * browser before both passed.
 */
import { randomUUID } from 'node:crypto';

import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { rateLimiter } from '../../../middleware/rateLimitMiddleware.js';
import {
  BrowserAgentBusyError,
  runBrowserAgent,
} from '../../../services/browserAgent/browserAgentClient.js';
import { createLogger } from '../../../utils/logger.js';
import { validateUrlForFetch } from '../../../utils/validation/urlSecurity.js';
import { storeBinaryAsset } from '../services/computeAssetStorage.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';
import type {
  BrowserSessionMeta,
  BrowserSessionScreenshot,
  BrowserSessionStatus,
  BrowserSessionStep,
} from '@gruenerator/contracts';

const log = createLogger('WebsiteErkundenTool');

export const BROWSER_AGENT_RATE_RESOURCE = 'browser_agent';

export interface WebsiteErkundenToolCtx {
  state: ChatGraphState;
  sse: SSEWriter;
  userId: string | null;
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === 'AbortError');
}

/** The loop's per-call timeout aborts with a `TimeoutError` reason (wrapTools);
 *  a Stop/disconnect does not. */
function isTimeout(signal: AbortSignal | undefined): boolean {
  const reason: unknown = signal?.reason;
  return reason instanceof Error && reason.name === 'TimeoutError';
}

const TIMEOUT_PREFIX = 'Teilergebnis (Zeitlimit erreicht, der Browser wurde vorzeitig gestoppt)';

export function makeWebsiteErkundenTool(ctx: WebsiteErkundenToolCtx): Tool {
  return tool({
    description: `Bedient eine Website in einem echten Browser: klicken, suchen, durch Seiten navigieren, Cookie-Banner ablehnen und Screenshots speichern. Die Person sieht live zu.

NUTZE WENN:
- Eine Website BEDIENT werden muss, um an etwas heranzukommen (Suchfeld benutzen, Menüs/Reiter durchklicken, Filter setzen)
- Screenshots einer Seite gewünscht sind ("mach einen Screenshot von …")

NICHT zum bloßen Lesen einer bekannten URL — dafür gibt es scrape_url (schneller, liefert zitierbaren Text).
Sendet keine Formulare ab, kauft nichts und meldet sich nirgends an.`,
    inputSchema: z.object({
      url: z.string().describe('Startadresse inkl. https://'),
      auftrag: z
        .string()
        .min(1)
        .max(2000)
        .describe('Was der Browser auf der Seite tun soll, in ganzen Sätzen.'),
      screenshots_erwartet: z
        .number()
        .int()
        .min(0)
        .max(10)
        .optional()
        .describe('Wie viele Screenshots die Person ausdrücklich haben möchte.'),
    }),
    execute: async ({ url, auftrag, screenshots_erwartet }, { abortSignal }) => {
      const { state, sse, userId } = ctx;
      if (!userId) return { error: 'Keine Sitzung — die Website kann nicht erkundet werden.' };

      const validation = await validateUrlForFetch(url);
      if (!validation.isValid || !validation.url) {
        return {
          error:
            'Diese Adresse ist nicht erlaubt oder ungültig. Übergib eine öffentliche Adresse inkl. https://.',
        };
      }
      const startUrl = validation.url.href;

      const budget = await rateLimiter.incrementCount(
        BROWSER_AGENT_RATE_RESOURCE,
        userId,
        'authenticated'
      );
      if (!budget.success && budget.limitReached) {
        return {
          error:
            'Das Limit für Website-Erkundungen ist erreicht (10 pro Stunde). Bitte versuche es in einer Stunde noch einmal.',
        };
      }

      const id = randomUUID();
      const steps: BrowserSessionStep[] = [];
      const screenshots: BrowserSessionScreenshot[] = [];
      let summary = '';
      let status: BrowserSessionStatus = 'running';
      let abgebrochen = false;
      // Teilergebnis: Dienst-Deckel (`done.timed_out`) oder Zeitlimit des Loops.
      // Ein eigenes Feld, damit der Schreiber es nicht am Summary-Präfix erraten muss.
      let zeitlimit = false;
      let error: string | null = null;

      const persist = () => {
        const meta: BrowserSessionMeta = { id, startUrl, status, steps, screenshots, summary };
        state.browserSession = meta;
      };

      sse.send('browser_session_start', { id, url: startUrl, title: validation.url.hostname });
      persist();

      try {
        for await (const event of runBrowserAgent({
          runId: id,
          userId,
          task: auftrag,
          startUrl,
          signal: abortSignal ?? new AbortController().signal,
        })) {
          if (event.type === 'step') {
            // A step without a frame (screenshot failed) keeps its row but no image.
            const imageUrl = event.screenshot_jpeg_b64
              ? (
                  await storeBinaryAsset(
                    userId,
                    Buffer.from(event.screenshot_jpeg_b64, 'base64'),
                    'jpg'
                  )
                ).url
              : '';
            const s: BrowserSessionStep = {
              n: event.n,
              url: event.url,
              title: event.title,
              action: event.action,
              target: event.target,
              xPct: event.x_pct,
              yPct: event.y_pct,
              thought: event.thought,
              imageUrl,
            };
            steps.push(s);
            sse.send('browser_session_update', { id, step: s });
          } else if (event.type === 'screenshot_saved') {
            const file = await storeBinaryAsset(
              userId,
              Buffer.from(event.png_b64, 'base64'),
              'png'
            );
            const shot = { name: event.file_name, url: file.url };
            screenshots.push(shot);
            sse.send('browser_session_update', { id, screenshot: shot });
          } else if (event.type === 'done') {
            status = 'done';
            zeitlimit = event.timed_out;
            summary = event.timed_out ? `${TIMEOUT_PREFIX}: ${event.summary}` : event.summary;
          } else {
            log.warn(`[website_erkunden] service error: ${event.message}`);
            status = 'failed';
            error = 'Die Website konnte nicht erkundet werden.';
          }
          persist();
          // `done`/`error` are terminal; leaving the loop closes the stream, and
          // the service cleans up on disconnect instead of us waiting for EOF.
          if (status !== 'running') break;
        }
        if (status === 'running') {
          status = 'failed';
          error = 'Der Browser hat den Lauf ohne Ergebnis beendet.';
        }
      } catch (err) {
        status = 'failed';
        if (isAbort(err, abortSignal) && isTimeout(abortSignal)) {
          // Time limit, not a Stop: what was seen so far is a partial result.
          status = 'done';
          zeitlimit = true;
          summary = `${TIMEOUT_PREFIX} nach ${steps.length} Schritten.`;
        } else if (isAbort(err, abortSignal)) {
          abgebrochen = true;
          summary = 'Abgebrochen.';
        } else if (err instanceof BrowserAgentBusyError) {
          error = 'Der Browser ist gerade ausgelastet. Bitte versuche es gleich noch einmal.';
        } else {
          log.error(
            `[website_erkunden] run failed: ${err instanceof Error ? err.message : String(err)}`
          );
          error = 'Die Website konnte nicht erkundet werden.';
        }
      }

      if (error && !summary) summary = error;
      persist();
      sse.send('browser_session_update', { id, status, summary });

      const fehlend = Math.max(0, (screenshots_erwartet ?? 0) - screenshots.length);
      if (error) return { error, screenshots, fehlend, schritte: steps.length };
      return {
        summary,
        screenshots,
        fehlend,
        schritte: steps.length,
        abgebrochen,
        zeitlimit,
      };
    },
  });
}
