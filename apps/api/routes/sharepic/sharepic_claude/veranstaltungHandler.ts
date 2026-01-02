import type { Response } from 'express';
import prompts from '../../../prompts/sharepic/index.js';
import { createLogger } from '../../../utils/logger.js';
import {
  extractCleanJSON,
  extractCleanJSONArray,
  isThrottlingError,
  sanitizeInfoField,
  replaceTemplate
} from '../../../utils/sharepic/index.js';
import type { SharepicRequest, EventResponse } from './types.js';

const log = createLogger('sharepic_veranstaltung');

export async function handleVeranstaltungRequest(
  req: SharepicRequest,
  res: Response
): Promise<void> {
  log.debug('[sharepic_veranstaltung] handleVeranstaltungRequest called with body:', req.body);

  const { thema, count = 5 } = req.body;
  const singleItem = count === 1;

  log.debug('[sharepic_veranstaltung] Config:', { singleItem, count });

  const config = req.body._campaignPrompt || prompts.veranstaltung;
  const systemRole = config.systemRole;

  const getVeranstaltungRequestTemplate = (): string => {
    const template = singleItem ? config.singleItemTemplate : config.requestTemplate;
    return replaceTemplate(template, { thema, count });
  };

  try {
    let attempts = 0;
    const maxAttempts = 5;
    let responseData: EventResponse | null = null;

    while (attempts < maxAttempts && !responseData) {
      const currentRequestTemplate = getVeranstaltungRequestTemplate();

      const result = await req.app.locals.aiWorkerPool.processRequest({
        type: 'sharepic_veranstaltung',
        systemPrompt: systemRole,
        messages: [{ role: 'user', content: currentRequestTemplate }],
        options: config.options
      }, req);

      if (!result.success) {
        const isThrottling = isThrottlingError(result.error);
        if (!isThrottling) {
          attempts++;
        }

        log.error(`[sharepic_veranstaltung] AI Worker error ${isThrottling ? '(throttling)' : `on attempt ${attempts}`}:`, result.error);

        if (attempts === maxAttempts) {
          res.status(500).json({ success: false, error: result.error } as EventResponse);
          return;
        }
        continue;
      }

      attempts++;
      const content = result.content || '';

      if (singleItem) {
        const eventData = extractCleanJSON(content);
        log.debug(`[sharepic_veranstaltung] Attempt ${attempts} - Raw content preview:`, content.substring(0, 200));
        log.debug(`[sharepic_veranstaltung] Attempt ${attempts} - Parsed eventData:`, eventData);

        if (eventData) {
          const eventTitle = sanitizeInfoField(eventData.eventTitle);
          const beschreibung = sanitizeInfoField(eventData.beschreibung);
          const weekday = sanitizeInfoField(eventData.weekday);
          const date = sanitizeInfoField(eventData.date);
          const time = sanitizeInfoField(eventData.time);
          const locationName = sanitizeInfoField(eventData.locationName);
          const address = sanitizeInfoField(eventData.address);
          const searchTerm = sanitizeInfoField(eventData.searchTerm);

          if (!eventTitle || !weekday || !date || !time || !locationName) {
            log.debug(`[sharepic_veranstaltung] Attempt ${attempts} - Validation failed: missing required fields`);
            if (attempts === maxAttempts) {
              res.status(500).json({
                success: false,
                error: 'Missing required fields in JSON response after all attempts'
              } as EventResponse);
              return;
            }
            continue;
          }

          responseData = {
            success: true,
            mainEvent: {
              eventTitle: eventTitle.substring(0, 35),
              beschreibung: (beschreibung || '').substring(0, 150),
              weekday,
              date,
              time,
              locationName: locationName.substring(0, 45),
              address: (address || '').substring(0, 45)
            },
            alternatives: [],
            searchTerms: searchTerm ? [searchTerm] : []
          };
        } else {
          if (attempts === maxAttempts) {
            const preview = content.replace(/\s+/g, ' ').slice(0, 200);
            res.status(500).json({
              success: false,
              error: `JSON extraction failed after ${maxAttempts} attempts. Snippet: ${preview}`
            } as EventResponse);
            return;
          }
          continue;
        }
      } else {
        const eventArray = extractCleanJSONArray(content);
        log.debug(`[sharepic_veranstaltung] Attempt ${attempts} - Raw content preview:`, content.substring(0, 200));
        log.debug(`[sharepic_veranstaltung] Attempt ${attempts} - Parsed array:`, eventArray?.length || 0, 'items');

        if (!eventArray || !Array.isArray(eventArray) || eventArray.length === 0) {
          log.debug(`[sharepic_veranstaltung] Attempt ${attempts} - Array extraction failed or empty`);
          if (attempts === maxAttempts) {
            res.status(500).json({
              success: false,
              error: `Failed to extract event array after ${maxAttempts} attempts`
            } as EventResponse);
            return;
          }
          continue;
        }

        interface EventItem {
          eventTitle: string;
          beschreibung: string;
          weekday: string;
          date: string;
          time: string;
          locationName: string;
          address: string;
        }

        const validEvents: EventItem[] = [];
        for (const item of eventArray) {
          const itemData = item as Record<string, unknown>;
          const eventTitle = sanitizeInfoField(itemData.eventTitle);
          const beschreibung = sanitizeInfoField(itemData.beschreibung);
          const weekday = sanitizeInfoField(itemData.weekday);
          const date = sanitizeInfoField(itemData.date);
          const time = sanitizeInfoField(itemData.time);
          const locationName = sanitizeInfoField(itemData.locationName);
          const address = sanitizeInfoField(itemData.address);

          if (eventTitle && weekday && date && time && locationName) {
            validEvents.push({
              eventTitle: eventTitle.substring(0, 35),
              beschreibung: (beschreibung || '').substring(0, 150),
              weekday,
              date,
              time,
              locationName: locationName.substring(0, 45),
              address: (address || '').substring(0, 45)
            });
          }
        }

        if (validEvents.length === 0) {
          log.debug(`[sharepic_veranstaltung] Attempt ${attempts} - No valid items after validation`);
          if (attempts === maxAttempts) {
            res.status(500).json({
              success: false,
              error: `No valid event items after ${maxAttempts} attempts`
            } as EventResponse);
            return;
          }
          continue;
        }

        const firstItem = eventArray[0] as Record<string, unknown>;
        const searchTerms = firstItem?.searchTerm ? [String(firstItem.searchTerm)] : [];

        log.debug(`[sharepic_veranstaltung] Success: ${validEvents.length} valid items, searchTerms:`, searchTerms);

        responseData = {
          success: true,
          mainEvent: validEvents[0],
          alternatives: validEvents.slice(1),
          searchTerms: searchTerms
        };
      }
    }

    if (responseData) {
      res.json(responseData);
    } else {
      log.error(`[sharepic_veranstaltung] Failed to generate valid event after ${maxAttempts} attempts`);
      res.status(500).json({
        success: false,
        error: `Failed to generate valid event after ${maxAttempts} attempts`
      } as EventResponse);
    }
  } catch (error) {
    log.error('[sharepic_veranstaltung] Error:', error);
    res.status(500).json({ success: false, error: (error as Error).message } as EventResponse);
  }
}
