import type { Response } from 'express';
import prompts from '../../../prompts/sharepic/index.js';
import { createLogger } from '../../../utils/logger.js';
import {
  extractCleanJSON,
  extractQuoteArray,
  isThrottlingError,
  replaceTemplate
} from '../../../utils/sharepic/index.js';
import type { SharepicRequest, ZitatResponse } from './types.js';

const log = createLogger('sharepic_zitat_pure');

export async function handleZitatPureRequest(
  req: SharepicRequest,
  res: Response
): Promise<void> {
  const { thema, quote, name, count = 5, preserveName = false, source: _source } = req.body;
  const singleItem = count === 1;

  const config = req.body._campaignPrompt || prompts.zitat_pure;
  const systemRole = config.systemRole;

  const requestTemplate = replaceTemplate(
    singleItem ? config.singleItemTemplate : config.requestTemplate,
    { thema, quote, name, preserveName }
  );

  try {
    let attempts = 0;
    const maxAttempts = 5;
    let result: { success: boolean; content?: string; error?: string } | undefined;

    while (attempts < maxAttempts) {
      result = await req.app.locals.aiWorkerPool.processRequest({
        type: 'sharepic_zitat_pure',
        systemPrompt: systemRole,
        messages: [{ role: 'user', content: requestTemplate }],
        options: config.options
      }, req);

      if (!result.success) {
        const isThrottling = isThrottlingError(result.error);
        if (!isThrottling) {
          attempts++;
        }

        log.error(`[sharepic_zitat_pure] AI Worker error ${isThrottling ? '(throttling)' : `on attempt ${attempts}`}:`, result.error);

        if (attempts === maxAttempts) {
          res.status(500).json({ success: false, error: result.error } as ZitatResponse);
          return;
        }
        continue;
      }

      break;
    }

    let quotes: Array<{ quote: string }> = [];
    let quoteName = name || '';
    const content = result?.content || '';

    if (singleItem) {
      if (preserveName && name) {
        quotes = [{ quote: content.trim() }];
        quoteName = name;
      } else {
        const zitatData = extractCleanJSON(content);
        if (zitatData && typeof zitatData.quote === 'string') {
          quotes = [{ quote: zitatData.quote }];
          quoteName = typeof zitatData.name === 'string' ? zitatData.name : quoteName;
        } else {
          quotes = [{ quote: content.trim() }];
        }
      }
    } else {
      const extractedQuotes = extractQuoteArray(content);
      if (!extractedQuotes || extractedQuotes.length === 0) {
        quotes = [{ quote: content.trim() }];
      } else {
        quotes = extractedQuotes.map((item) =>
          typeof item === 'string' ? { quote: item } : { quote: (item as { quote?: string }).quote || '' }
        );
      }
    }

    const firstQuote = quotes[0]?.quote || content.trim();
    const alternatives = quotes.slice(1);

    res.json({
      success: true,
      quote: firstQuote,
      alternatives: alternatives,
      name: quoteName
    } as ZitatResponse);
  } catch (error) {
    log.error('[sharepic_zitat_pure] Error:', error);
    res.status(500).json({ success: false, error: (error as Error).message } as ZitatResponse);
  }
}
