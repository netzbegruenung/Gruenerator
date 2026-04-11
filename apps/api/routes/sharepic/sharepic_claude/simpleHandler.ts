/**
 * Simple Handler - AI text generation for "Text auf Bild" sharepic
 * Generates headline + subtext combinations from a theme description
 */

import prompts from '../../../prompts/sharepic/index.js';
import { getAIWorkerPool } from '../../../utils/getAIWorkerPool.js';
import { createLogger } from '../../../utils/logger.js';
import { isThrottlingError, replaceTemplate } from '../../../utils/sharepic/index.js';

import type { SharepicRequest } from './types.js';
import type { AIWorkerResult } from '../../../workers/types.js';
import type { Response } from 'express';

interface SimplePromptConfig {
  systemRole: string;
  requestTemplate: string;
  singleItemTemplate: string;
  options: Record<string, unknown>;
  alternativesOptions?: Record<string, unknown>;
}

const log = createLogger('sharepic_simple');

export interface SimpleAlternative {
  headline: string;
  subtext: string;
}

export interface SimpleResponse {
  success: boolean;
  headline?: string;
  subtext?: string;
  alternatives?: SimpleAlternative[];
  error?: string;
}

/**
 * Parse AI response to extract headline/subtext combinations
 */
function parseSimpleResponse(content: string): SimpleAlternative[] {
  try {
    // Try to parse as JSON array
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      if (Array.isArray(parsed)) {
        return (parsed as Array<Record<string, unknown>>)
          .map((item) => ({
            headline: typeof item['headline'] === 'string' ? item['headline'] : '',
            subtext: typeof item['subtext'] === 'string' ? item['subtext'] : '',
          }))
          .filter((item) => item.headline || item.subtext);
      }
    }

    // Try to parse as single JSON object
    const objMatch = content.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0]) as Record<string, unknown>;
      if (parsed['headline'] || parsed['subtext']) {
        return [
          {
            headline: typeof parsed['headline'] === 'string' ? parsed['headline'] : '',
            subtext: typeof parsed['subtext'] === 'string' ? parsed['subtext'] : '',
          },
        ];
      }
    }

    // Fallback: try to extract from plain text
    const lines = content
      .trim()
      .split('\n')
      .filter((l) => l.trim());
    if (lines.length >= 2) {
      return [
        {
          headline: lines[0].replace(/^(headline|titel|überschrift):\s*/i, '').trim(),
          subtext: lines[1].replace(/^(subtext|untertitel|text):\s*/i, '').trim(),
        },
      ];
    }

    // Last resort: use content as headline
    return [
      {
        headline: content.trim().substring(0, 50),
        subtext: '',
      },
    ];
  } catch (e) {
    log.error('Error parsing simple response:', e);
    return [
      {
        headline: content.trim().substring(0, 50),
        subtext: '',
      },
    ];
  }
}

export async function handleSimpleRequest(req: SharepicRequest, res: Response): Promise<void> {
  const { thema, count = 5 } = req.body;
  const singleItem = count === 1;

  // Use the simple prompt config (will be added to prompts/sharepic/index.js)
  const rawConfig = req.body._campaignPrompt || (prompts as Record<string, unknown>).simple;

  if (!rawConfig) {
    log.error('Simple prompt configuration not found');
    res
      .status(500)
      .json({ success: false, error: 'Prompt configuration not found' } as SimpleResponse);
    return;
  }

  const config = rawConfig as SimplePromptConfig;
  const systemRole = config.systemRole;
  const requestOptions = singleItem
    ? config.options
    : config.alternativesOptions ?? config.options;

  const requestTemplate = replaceTemplate(
    singleItem ? config.singleItemTemplate : config.requestTemplate,
    { thema }
  );

  try {
    let attempts = 0;
    const maxAttempts = 5;
    let result: AIWorkerResult | undefined;

    while (attempts < maxAttempts) {
      result = await getAIWorkerPool(req).processRequest(
        {
          type: 'sharepic_simple',
          systemPrompt: systemRole,
          messages: [{ role: 'user', content: requestTemplate }],
          options: requestOptions,
        },
        req
      );

      if (!result || !result.success) {
        const isThrottling = isThrottlingError(result?.error);
        if (!isThrottling) {
          attempts++;
        }

        log.error(
          `[sharepic_simple] AI Worker error ${isThrottling ? '(throttling)' : `on attempt ${attempts}`}:`,
          result?.error
        );

        if (attempts === maxAttempts) {
          res.status(500).json({ success: false, error: result?.error } as SimpleResponse);
          return;
        }
        continue;
      }

      break;
    }

    const content = result?.content || '';
    const combinations = parseSimpleResponse(content);

    if (combinations.length === 0) {
      res
        .status(500)
        .json({ success: false, error: 'Could not parse AI response' } as SimpleResponse);
      return;
    }

    const firstItem = combinations[0];
    const alternatives = combinations.slice(1);

    res.json({
      success: true,
      headline: firstItem.headline,
      subtext: firstItem.subtext,
      alternatives: alternatives,
    } as SimpleResponse);
  } catch (error) {
    log.error('[sharepic_simple] Error:', error);
    res.status(500).json({ success: false, error: (error as Error).message } as SimpleResponse);
  }
}
