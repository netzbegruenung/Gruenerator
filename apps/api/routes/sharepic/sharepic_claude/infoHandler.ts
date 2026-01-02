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
import type { SharepicRequest, InfoResponse } from './types.js';

const log = createLogger('sharepic_info');

export async function handleInfoRequest(
  req: SharepicRequest,
  res: Response
): Promise<void> {
  log.debug('[sharepic_info] handleInfoRequest called with body:', req.body);

  const { thema, count = 5, source: _source } = req.body;
  const singleItem = count === 1;

  log.debug('[sharepic_info] Config:', { singleItem, count });

  const config = req.body._campaignPrompt || prompts.info;
  const systemRole = config.systemRole;

  const getInfoRequestTemplate = (): string => {
    const template = singleItem ? config.singleItemTemplate : config.requestTemplate;
    return replaceTemplate(template, { thema });
  };

  try {
    let attempts = 0;
    const maxAttempts = 5;
    let responseData: InfoResponse | null = null;

    while (attempts < maxAttempts && !responseData) {
      const currentRequestTemplate = getInfoRequestTemplate();

      const result = await req.app.locals.aiWorkerPool.processRequest({
        type: 'sharepic_info',
        systemPrompt: systemRole,
        messages: [{ role: 'user', content: currentRequestTemplate }],
        options: config.options
      }, req);

      if (!result.success) {
        const isThrottling = isThrottlingError(result.error);
        if (!isThrottling) {
          attempts++;
        }

        log.error(`[sharepic_info] AI Worker error ${isThrottling ? '(throttling)' : `on attempt ${attempts}`}:`, result.error);

        if (attempts === maxAttempts) {
          res.status(500).json({ success: false, error: result.error } as InfoResponse);
          return;
        }
        continue;
      }

      attempts++;
      const content = result.content || '';

      if (singleItem) {
        const infoData = extractCleanJSON(content);
        log.debug(`[sharepic_info] Attempt ${attempts} - Raw content preview:`, content.substring(0, 200));
        log.debug(`[sharepic_info] Attempt ${attempts} - Parsed infoData:`, infoData);

        if (infoData) {
          const header = sanitizeInfoField(infoData.header);
          const subheader = sanitizeInfoField(infoData.subheader);
          const body = sanitizeInfoField(infoData.body);
          const searchTerm = sanitizeInfoField(infoData.searchTerm);

          log.debug(`[sharepic_info] Attempt ${attempts} - Sanitized values:`, {
            header: header?.substring(0, 50) + '...',
            subheader: subheader?.substring(0, 50) + '...',
            body: body?.substring(0, 50) + '...',
            headerLength: header?.length,
            subheaderLength: subheader?.length,
            bodyLength: body?.length
          });

          if (!header || !subheader || !body ||
              header.trim() === '' || subheader.trim() === '' || body.trim() === '') {
            log.debug(`[sharepic_info] Attempt ${attempts} - Validation failed: empty or missing fields`);
            if (attempts === maxAttempts) {
              res.status(500).json({
                success: false,
                error: 'Missing required fields in JSON response after all attempts'
              } as InfoResponse);
              return;
            }
            continue;
          }

          let cleanHeader = header;
          let cleanSubheader = subheader;
          let cleanBody = body;

          if (cleanHeader.length > 65) {
            cleanHeader = cleanHeader.substring(0, 60).trim();
          }
          if (cleanSubheader.length > 125) {
            cleanSubheader = cleanSubheader.substring(0, 120).trim();
          }
          if (cleanBody.length > 255) {
            cleanBody = cleanBody.substring(0, 250).trim();
          }

          responseData = {
            success: true,
            mainInfo: {
              header: cleanHeader,
              subheader: cleanSubheader,
              body: cleanBody
            },
            alternatives: [],
            searchTerms: searchTerm ? [searchTerm] : []
          };
        } else {
          if (attempts === maxAttempts) {
            const preview = content.replace(/\s+/g, ' ').slice(0, 200);
            const previewSuffix = content.length > 200 ? '…' : '';
            res.status(500).json({
              success: false,
              error: `JSON extraction failed after ${maxAttempts} attempts. Snippet: ${preview}${previewSuffix}`
            } as InfoResponse);
            return;
          }
          continue;
        }
      } else {
        const infoArray = extractCleanJSONArray(content);
        log.debug(`[sharepic_info] Attempt ${attempts} - Raw content preview:`, content.substring(0, 200));
        log.debug(`[sharepic_info] Attempt ${attempts} - Parsed array:`, infoArray?.length || 0, 'items');

        if (!infoArray || !Array.isArray(infoArray) || infoArray.length === 0) {
          log.debug(`[sharepic_info] Attempt ${attempts} - Array extraction failed or empty`);
          if (attempts === maxAttempts) {
            res.status(500).json({
              success: false,
              error: `Failed to extract info array after ${maxAttempts} attempts`
            } as InfoResponse);
            return;
          }
          continue;
        }

        const validInfos: Array<{ header: string; subheader: string; body: string }> = [];
        for (const item of infoArray) {
          const itemData = item as Record<string, unknown>;
          const header = sanitizeInfoField(itemData.header);
          const subheader = sanitizeInfoField(itemData.subheader);
          const body = sanitizeInfoField(itemData.body);

          log.debug(`[sharepic_info] Validating item:`, {
            header: header?.substring(0, 30) + '...',
            subheader: subheader?.substring(0, 30) + '...',
            body: body?.substring(0, 30) + '...',
            headerLength: header?.length,
            subheaderLength: subheader?.length,
            bodyLength: body?.length
          });

          if (header && subheader && body &&
              header.trim() !== '' && subheader.trim() !== '' && body.trim() !== '') {
            validInfos.push({
              header: header.length > 65 ? header.substring(0, 65).trim() : header,
              subheader: subheader.length > 125 ? subheader.substring(0, 125).trim() : subheader,
              body: body.length > 255 ? body.substring(0, 255).trim() : body
            });
          } else {
            log.debug(`[sharepic_info] Item rejected: empty field(s)`);
          }
        }

        if (validInfos.length === 0) {
          log.debug(`[sharepic_info] Attempt ${attempts} - No valid items after validation`);
          if (attempts === maxAttempts) {
            res.status(500).json({
              success: false,
              error: `No valid info items after ${maxAttempts} attempts`
            } as InfoResponse);
            return;
          }
          continue;
        }

        const firstItem = infoArray[0] as Record<string, unknown>;
        const searchTerms = firstItem?.searchTerm ? [String(firstItem.searchTerm)] : [];

        log.debug(`[sharepic_info] Success: ${validInfos.length} valid items, searchTerms:`, searchTerms);

        responseData = {
          success: true,
          mainInfo: validInfos[0],
          alternatives: validInfos.slice(1),
          searchTerms: searchTerms
        };
      }
    }

    if (responseData) {
      res.json(responseData);
    } else {
      log.error(`[sharepic_info] Failed to generate valid info after ${maxAttempts} attempts`);
      res.status(500).json({
        success: false,
        error: `Failed to generate valid info after ${maxAttempts} attempts`
      } as InfoResponse);
    }
  } catch (error) {
    log.error('[sharepic_info] Error:', error);
    res.status(500).json({ success: false, error: (error as Error).message } as InfoResponse);
  }
}
