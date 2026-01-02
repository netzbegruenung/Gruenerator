import type { Response } from 'express';
import prompts from '../../../prompts/sharepic/index.js';
import { createLogger } from '../../../utils/logger.js';
import {
  cleanLine,
  isThrottlingError,
  replaceTemplate
} from '../../../utils/sharepic/index.js';
import type { SharepicRequest, DreizeilenResponse } from './types.js';

const log = createLogger('sharepic_headline');

export async function handleHeadlineRequest(
  req: SharepicRequest,
  res: Response
): Promise<void> {
  const { thema, line1, line2, line3, count = 1, source: _source } = req.body;
  const singleItem = count === 1;

  const config = req.body._campaignPrompt || prompts.headline;
  const systemRole = config.systemRole;

  const requestTemplate = replaceTemplate(
    singleItem ? config.singleItemTemplate : config.requestTemplate,
    { thema, line1, line2, line3 }
  );

  try {
    let attempts = 0;
    const maxAttempts = 5;
    let result: { success: boolean; content?: string; error?: string } | undefined;

    while (attempts < maxAttempts) {
      result = await req.app.locals.aiWorkerPool.processRequest({
        type: 'sharepic_headline',
        systemPrompt: systemRole,
        messages: [{ role: 'user', content: requestTemplate }],
        options: config.options
      }, req);

      if (!result.success) {
        const isThrottling = isThrottlingError(result.error);
        if (!isThrottling) {
          attempts++;
        }

        log.error(`[sharepic_headline] AI Worker error ${isThrottling ? '(throttling)' : `on attempt ${attempts}`}:`, result.error);

        if (attempts === maxAttempts) {
          res.status(500).json({ success: false, error: result.error } as DreizeilenResponse);
          return;
        }
        continue;
      }

      break;
    }

    const content = result?.content || '';
    const headlines: Array<{ line1: string; line2: string; line3: string }> = [];
    const searchTermMatch = content.match(/Suchbegriff[^:]*:(.+?)(?:\n|$)/i);
    const searchTerms = searchTermMatch ? [searchTermMatch[1].trim()] : [];

    if (singleItem) {
      const lines = content.split('\n').filter(line => line.trim() && !line.toLowerCase().includes('suchbegriff'));

      let mainSlogan = { line1: '', line2: '', line3: '' };

      for (let i = 0; i < lines.length - 2; i++) {
        const l1 = cleanLine(lines[i]);
        const l2 = cleanLine(lines[i + 1]);
        const l3 = cleanLine(lines[i + 2]);

        if (l1.length >= 6 && l1.length <= 15 &&
            l2.length >= 6 && l2.length <= 15 &&
            l3.length >= 6 && l3.length <= 15 &&
            !l1.toLowerCase().includes('headline') &&
            !l1.toLowerCase().includes('zeile') &&
            !l1.startsWith('**') &&
            !l1.includes('suchbegriff')) {
          mainSlogan = { line1: l1, line2: l2, line3: l3 };
          break;
        }
      }

      res.json({
        success: true,
        mainSlogan: mainSlogan,
        alternatives: [],
        searchTerms: searchTerms
      } as DreizeilenResponse);
    } else {
      const headlineMatches = content.matchAll(/\*\*Headline \d+:\*\*\s*\n([^\n]+)\n([^\n]+)\n([^\n]+)/g);
      for (const match of headlineMatches) {
        headlines.push({
          line1: match[1].trim(),
          line2: match[2].trim(),
          line3: match[3].trim()
        });
      }

      const mainSlogan = headlines[0] || { line1: '', line2: '', line3: '' };
      const alternatives = headlines.slice(1);

      res.json({
        success: true,
        mainSlogan: mainSlogan,
        alternatives: alternatives,
        searchTerms: searchTerms
      } as DreizeilenResponse);
    }
  } catch (error) {
    log.error('[sharepic_headline] Error:', error);
    res.status(500).json({ success: false, error: (error as Error).message } as DreizeilenResponse);
  }
}
