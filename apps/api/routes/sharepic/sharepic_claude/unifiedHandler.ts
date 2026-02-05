import type { Response } from 'express';
import prompts from '../../../prompts/sharepic/index.js';
import { createLogger } from '../../../utils/logger.js';
import {
  parseLabeledText,
  parseLabeledTextBatch,
  sanitizeField,
  truncateField,
} from '../../../utils/sharepic/textParser.js';
import { replaceTemplate } from '../../../utils/sharepic/template.js';
import type { SharepicRequest, PromptConfig } from './types.js';

const log = createLogger('sharepic_unified');

interface TypeConfig {
  fields: string[];
  mainKey: string;
  maxLengths?: Record<string, number>;
  coverMaxLengths?: Record<string, number>;
}

const TYPE_CONFIGS: Record<string, TypeConfig> = {
  info: {
    fields: ['header', 'subheader', 'body', 'suchbegriff'],
    mainKey: 'mainInfo',
    maxLengths: { header: 65, subheader: 125, body: 255 },
  },
  dreizeilen: {
    fields: ['zeile1', 'zeile2', 'zeile3', 'suchbegriff'],
    mainKey: 'mainSlogan',
    maxLengths: { zeile1: 35, zeile2: 35, zeile3: 35 },
  },
  veranstaltung: {
    fields: ['titel', 'tag', 'datum', 'zeit', 'ort', 'adresse', 'beschreibung', 'suchbegriff'],
    mainKey: 'mainEvent',
    maxLengths: { titel: 35, ort: 45, adresse: 45, beschreibung: 150 },
  },
  zitat: {
    fields: ['zitat'],
    mainKey: 'quote',
  },
  zitat_pure: {
    fields: ['zitat'],
    mainKey: 'quote',
  },
  headline: {
    fields: ['zeile1', 'zeile2', 'zeile3'],
    mainKey: 'mainSlogan',
    maxLengths: { zeile1: 20, zeile2: 20, zeile3: 20 },
  },
  simple: {
    fields: ['headline', 'subtext', 'suchbegriff'],
    mainKey: 'mainSimple',
    maxLengths: { headline: 50, subtext: 150 },
  },
  slider: {
    fields: ['label', 'headline', 'subtext', 'suchbegriff'],
    mainKey: 'mainSlider',
    maxLengths: { label: 25, headline: 130, subtext: 300 },
    coverMaxLengths: { label: 25, headline: 70, subtext: 100 },
  },
};

function mapToResponseFormat(
  type: string,
  data: Record<string, string>
): Record<string, unknown> | string {
  switch (type) {
    case 'info':
      return {
        header: data.header,
        subheader: data.subheader,
        body: data.body,
      };
    case 'dreizeilen':
    case 'headline':
      return {
        line1: data.zeile1,
        line2: data.zeile2,
        line3: data.zeile3,
      };
    case 'veranstaltung':
      return {
        eventTitle: data.titel,
        weekday: data.tag,
        date: data.datum,
        time: data.zeit,
        locationName: data.ort,
        address: data.adresse || '',
        beschreibung: data.beschreibung || '',
      };
    case 'zitat':
    case 'zitat_pure':
      return data.zitat || '';
    case 'simple':
      return {
        headline: data.headline,
        subtext: data.subtext,
      };
    case 'slider':
      return {
        label: data.label,
        headline: data.headline,
        subtext: data.subtext,
      };
    default:
      return data;
  }
}

export async function handleUnifiedRequest(
  req: SharepicRequest,
  res: Response,
  type: string
): Promise<void> {
  const config = TYPE_CONFIGS[type];
  if (!config) {
    res.status(400).json({ success: false, error: `Unknown type: ${type}` });
    return;
  }

  const { thema, details, quote, name, count = 1 } = req.body;
  const rawPromptConfig = req.body._campaignPrompt || prompts[type as keyof typeof prompts];

  if (!rawPromptConfig) {
    res.status(400).json({ success: false, error: `No prompt config for type: ${type}` });
    return;
  }

  const promptConfig = rawPromptConfig as PromptConfig;
  const template =
    count === 1
      ? promptConfig.singleItemTemplate || promptConfig.requestTemplate || ''
      : promptConfig.alternativesTemplate || promptConfig.requestTemplate || '';
  const options =
    count === 1 ? promptConfig.options : promptConfig.alternativesOptions || promptConfig.options;

  const requestContent = replaceTemplate(template, {
    thema: thema || '',
    details: details || '',
    quote: quote || '',
    name: name || '',
    count: count.toString(),
    count_minus_one: Math.max(1, count - 1).toString(),
  });

  log.debug(`[${type}] Request:`, requestContent.substring(0, 100) + '...');

  let attempts = 0;
  const maxAttempts = 2;
  let lastError = '';

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const result = await req.app.locals.aiWorkerPool.processRequest(
        {
          type: `sharepic_${type}`,
          systemPrompt: promptConfig.systemRole,
          messages: [{ role: 'user', content: requestContent }],
          options,
        },
        req
      );

      if (!result.success) {
        lastError = result.error || 'AI request failed';
        log.warn(`[${type}] Attempt ${attempts} AI error:`, lastError);
        continue;
      }

      const content = result.content || '';

      let mainData: Record<string, unknown> | string;
      let alternatives: Array<Record<string, unknown> | string> = [];
      let searchTerms: string[] = [];

      if (count > 1) {
        const parseResults = parseLabeledTextBatch(content, config.fields, count);

        if (parseResults.length === 0) {
          lastError = 'No valid alternatives parsed';
          log.warn(`[${type}] Attempt ${attempts} parse error: ${lastError}`);
          continue;
        }

        const totalVariants = parseResults.length;
        const processedResults = parseResults.map((parseResult, idx) => {
          const isCover = idx === 0 || idx === totalVariants - 1;
          const limits = isCover && config.coverMaxLengths
            ? config.coverMaxLengths
            : config.maxLengths;
          const processedData: Record<string, string> = {};
          for (const [key, value] of Object.entries(parseResult.data)) {
            let processed = sanitizeField(value);
            if (limits?.[key]) {
              processed = truncateField(processed, limits[key]);
            }
            processedData[key] = processed;
          }
          return processedData;
        });

        mainData = mapToResponseFormat(type, processedResults[0]);
        alternatives = processedResults.slice(1).map((data) => mapToResponseFormat(type, data));
        searchTerms = processedResults.flatMap((data) =>
          data.suchbegriff ? [data.suchbegriff] : []
        );
      } else {
        const parseResult = parseLabeledText(content, config.fields);

        if (!parseResult.success) {
          lastError = parseResult.error || 'Parse failed';
          log.warn(`[${type}] Attempt ${attempts} parse error:`, lastError);
          continue;
        }

        const processedData: Record<string, string> = {};
        for (const [key, value] of Object.entries(parseResult.data)) {
          let processed = sanitizeField(value);
          if (config.maxLengths?.[key]) {
            processed = truncateField(processed, config.maxLengths[key]);
          }
          processedData[key] = processed;
        }

        mainData = mapToResponseFormat(type, processedData);
        searchTerms = processedData.suchbegriff ? [processedData.suchbegriff] : [];
      }

      const response: Record<string, unknown> = {
        success: true,
        [config.mainKey]: mainData,
        alternatives,
        searchTerms,
      };

      if (type === 'zitat' || type === 'zitat_pure') {
        response.quote = mainData;
        response.name = name || '';
      }

      log.info(`[${type}] Success on attempt ${attempts}`);
      res.json(response);
      return;
    } catch (error) {
      lastError = (error as Error).message;
      log.error(`[${type}] Attempt ${attempts} exception:`, error);
    }
  }

  log.error(`[${type}] Failed after ${maxAttempts} attempts:`, lastError);
  res.status(500).json({
    success: false,
    error: `Failed after ${maxAttempts} attempts: ${lastError}`,
  });
}
