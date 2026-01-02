import type { Response } from 'express';
import prompts from '../../../prompts/sharepic/index.js';
import { createLogger } from '../../../utils/logger.js';
import {
  extractQuoteArray,
  isThrottlingError,
  replaceTemplate
} from '../../../utils/sharepic/index.js';
import type { SharepicRequest, ZitatResponse } from './types.js';

const log = createLogger('sharepic_zitat');

export async function handleZitatRequest(
  req: SharepicRequest,
  res: Response
): Promise<void> {
  const { thema, quote, name, count = 1, source: _source } = req.body;
  const singleItem = count === 1;

  const config = req.body._campaignPrompt || prompts.zitat;
  const systemRole = config.systemRole;

  const requestTemplate = replaceTemplate(
    singleItem ? config.singleItemTemplate : config.requestTemplate,
    { thema, quote, name }
  );

  try {
    let attempts = 0;
    const maxAttempts = 5;
    let result: { success: boolean; content?: string; error?: string } | undefined;

    while (attempts < maxAttempts) {
      result = await req.app.locals.aiWorkerPool.processRequest({
        type: 'sharepic_zitat',
        systemPrompt: systemRole,
        messages: [{ role: 'user', content: requestTemplate }],
        options: config.options
      }, req);

      if (!result.success) {
        const isThrottling = isThrottlingError(result.error);
        if (!isThrottling) {
          attempts++;
        }

        log.error(`[sharepic_zitat] AI Worker error ${isThrottling ? '(throttling)' : `on attempt ${attempts}`}:`, result.error);

        if (attempts === maxAttempts) {
          res.status(500).json({ success: false, error: result.error } as ZitatResponse);
          return;
        }
        continue;
      }

      break;
    }

    let quotes: Array<{ quote: string }> = [];
    let firstQuote = '';
    let alternatives: Array<{ quote: string }> = [];
    const content = result?.content || '';

    if (singleItem) {
      try {
        const jsonMatch = content.match(/\{[^}]*"quote"\s*:\s*"[^"]+"\s*[^}]*\}/);
        if (jsonMatch) {
          const quoteData = JSON.parse(jsonMatch[0]);
          firstQuote = quoteData.quote || '';
        } else {
          firstQuote = content.trim();
        }
        alternatives = [];

      } catch (parseError) {
        log.warn('[sharepic_zitat] Single item JSON parsing failed, using fallback:', (parseError as Error).message);
        firstQuote = content.trim();
        alternatives = [];
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

      firstQuote = quotes[0]?.quote || content.trim();
      alternatives = quotes.slice(1);
    }

    res.json({
      success: true,
      quote: firstQuote,
      alternatives: alternatives,
      name: name || ''
    } as ZitatResponse);
  } catch (error) {
    log.error('[sharepic_zitat] Error:', error);
    res.status(500).json({ success: false, error: (error as Error).message } as ZitatResponse);
  }
}
