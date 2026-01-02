import type { Response } from 'express';
import prompts from '../../../prompts/sharepic/index.js';
import { createLogger } from '../../../utils/logger.js';
import {
  parseDreizeilenResponse,
  isSloganValid,
  isThrottlingError,
  replaceTemplate,
  type Slogan
} from '../../../utils/sharepic/index.js';
import type { SharepicRequest, DreizeilenResponse } from './types.js';

const log = createLogger('sharepic_dreizeilen');

export async function handleDreizeilenRequest(
  req: SharepicRequest,
  res: Response
): Promise<void> {
  const { thema, line1, line2, line3, count = 1, source } = req.body;
  const singleItem = count === 1;
  const skipShortener = source === 'sharepicgenerator';

  const config = req.body._campaignPrompt || prompts.dreizeilen;
  const systemRole = config.systemRole;

  const getRequestTemplate = (): string => {
    const template = singleItem ? config.singleItemTemplate : config.requestTemplate;
    const templateData = { thema, line1, line2, line3 };
    return replaceTemplate(template, templateData);
  };

  try {
    let attempts = 0;
    const maxAttempts = 5;
    let mainSlogan: Slogan = { line1: '', line2: '', line3: '' };
    let searchTerms: string[] = [];
    const allGeneratedContent: Array<{ attempt: number; content: string; timestamp: string }> = [];
    let result: { success: boolean; content?: string; error?: string } | undefined;

    while (attempts < maxAttempts) {
      const requestTemplate = getRequestTemplate();
      const requestOptions = config.options;

      result = await req.app.locals.aiWorkerPool.processRequest({
        type: 'sharepic_dreizeilen',
        systemPrompt: systemRole,
        messages: [{ role: 'user', content: requestTemplate }],
        options: requestOptions
      }, req);

      if (!result.success) {
        const isThrottling = isThrottlingError(result.error);
        if (!isThrottling) {
          attempts++;
        }

        log.error(`[sharepic_dreizeilen] AI Worker error ${isThrottling ? '(throttling)' : `on attempt ${attempts}`}:`, result.error);

        if (attempts === maxAttempts) {
          res.status(500).json({ success: false, error: result.error } as DreizeilenResponse);
          return;
        }
        continue;
      }

      attempts++;
      const content = result.content || '';

      allGeneratedContent.push({
        attempt: attempts,
        content: content.substring(0, 300) + (content.length > 300 ? '...' : ''),
        timestamp: new Date().toISOString()
      });

      const searchTermMatch = content.match(/Suchbegriff[^:]*:(.+?)(?:\n|$)/i);
      searchTerms = searchTermMatch ? [searchTermMatch[1].trim()] : [];

      if (singleItem) {
        log.debug(`[sharepic_dreizeilen] Raw AI response on attempt ${attempts}:`, content.substring(0, 300) + (content.length > 300 ? '...' : ''));
        log.debug(`[sharepic_dreizeilen] Calling parser with ${content.length} chars`);
        mainSlogan = parseDreizeilenResponse(content, skipShortener);
        log.debug(`[sharepic_dreizeilen] Parsed slogan on attempt ${attempts}:`, mainSlogan);

        if (isSloganValid(mainSlogan)) {
          log.debug(`[sharepic_dreizeilen] Valid slogan found on attempt ${attempts}`);
          break;
        } else {
          log.debug(`[sharepic_dreizeilen] Invalid slogan on attempt ${attempts}, continuing...`);
        }
      } else {
        log.debug(`[sharepic_dreizeilen] Parsing multiple slogans (count=${count})`);
        const slogans: Slogan[] = [];
        const lines = content.split('\n');

        for (let i = 0; i <= lines.length - 3; i++) {
          const l1 = lines[i].trim();
          const l2 = lines[i + 1].trim();
          const l3 = lines[i + 2].trim();

          if (l1 && l2 && l3 &&
              !l1.toLowerCase().includes('suchbegriff') &&
              !l2.toLowerCase().includes('suchbegriff') &&
              !l3.toLowerCase().includes('suchbegriff') &&
              l1.length >= 3 && l1.length <= 35 &&
              l2.length >= 3 && l2.length <= 35 &&
              l3.length >= 3 && l3.length <= 35) {

            log.debug(`[sharepic_dreizeilen] Found slogan ${slogans.length + 1}: "${l1}", "${l2}", "${l3}"`);
            slogans.push({ line1: l1, line2: l2, line3: l3 });
            i += 2;

            if (slogans.length >= 5) break;
          }
        }

        log.debug(`[sharepic_dreizeilen] Found ${slogans.length} slogans total`);
        mainSlogan = slogans[0] || { line1: '', line2: '', line3: '' };
        if (isSloganValid(mainSlogan)) {
          const alternatives = slogans.slice(1);

          res.json({
            success: true,
            mainSlogan: mainSlogan,
            alternatives: alternatives,
            searchTerms: searchTerms
          } as DreizeilenResponse);
          return;
        }
      }
    }

    if (!isSloganValid(mainSlogan)) {
      const lastContent = result?.content || 'No content available';
      const contentPreview = lastContent.substring(0, 200) + (lastContent.length > 200 ? '...' : '');

      log.error(`[sharepic_dreizeilen] Failed to generate valid dreizeilen after ${maxAttempts} attempts`);
      log.error(`[sharepic_dreizeilen] Last generated content preview:`, contentPreview);
      log.error(`[sharepic_dreizeilen] Final mainSlogan state:`, mainSlogan);

      res.status(500).json({
        success: false,
        error: `Failed to generate valid dreizeilen after ${maxAttempts} attempts`,
        debug: {
          contentPreview,
          finalSlogan: mainSlogan,
          attempts: maxAttempts,
          allGeneratedContent
        }
      } as DreizeilenResponse);
      return;
    }

    res.json({
      success: true,
      mainSlogan: mainSlogan,
      alternatives: [],
      searchTerms: searchTerms
    } as DreizeilenResponse);

  } catch (error) {
    log.error('[sharepic_dreizeilen] Error:', error);
    res.status(500).json({ success: false, error: (error as Error).message } as DreizeilenResponse);
  }
}
