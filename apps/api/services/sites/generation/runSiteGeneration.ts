import {
  siteGenerateBodySchema,
  type SiteGenerationEvent,
  type SiteGenerationStep,
} from '@gruenerator/contracts';

import { toUserFacingMessage } from '../../../utils/errors/index.js';
import { createLogger } from '../../../utils/logger.js';
import imagePickerService from '../../image/ImageSelectionService.js';
import { type Locale } from '../../localization/index.js';
import { AiProviderError } from '../../providers/providerErrors.js';

import { attachImages, toSiteDraft } from './content.js';
import { analyzeFlyer } from './flyer/analyzeFlyer.js';
import { extractFlyerText } from './flyer/extractFlyerText.js';
import { type FlyerHints } from './prompt.js';
import { writeSiteContent } from './writeSiteContent.js';

const log = createLogger('sites:generate');

export const FLYER_NO_TEXT_MESSAGE =
  'Der Flyer enthält keinen lesbaren Text. Bitte lade eine andere Datei hoch.';
export const FLYER_READ_FAILED_MESSAGE =
  'Der Flyer konnte nicht gelesen werden. Bitte versuch es noch einmal.';
export const GENERATION_FAILED_MESSAGE =
  'Die Seite konnte nicht erstellt werden. Bitte versuch es noch einmal.';

export type SiteGenerationSource =
  { kind: 'text'; description: string } | { kind: 'flyer'; pdf: Buffer };

export interface RunSiteGenerationInput {
  source: SiteGenerationSource;
  email: string;
  locale: Locale;
  signal: AbortSignal;
}

const emailSchema = siteGenerateBodySchema.shape.email;

function validEmail(value: string): string | null {
  if (!value) return null;
  const parsed = emailSchema.safeParse(value);
  return parsed.success && parsed.data ? parsed.data : null;
}

function failureMessage(err: unknown, fallback: string): string {
  return err instanceof AiProviderError ? toUserFacingMessage(err, fallback) : fallback;
}

/**
 * At most one draft per this many ms. Gemma writes a site in ~190 argument
 * chunks over 10–20 s; a frame per chunk would re-render the preview ~15 times a
 * second for no visible gain. A dropped frame costs nothing: the next one, or
 * the images step right after, carries everything before it.
 */
export const DRAFT_INTERVAL_MS = 150;

const STOCK_IMAGE_PREFIX = '/api/image-picker/stock-image/';
// A candidate's site must not show alcohol (the catalog's pub photo was picked as contact background).
const SITE_EXCLUDED_TAGS = ['beer', 'wine', 'alcohol'] as const;

async function pickImage(text: string, exclude: readonly string[]): Promise<string> {
  try {
    const picked = await imagePickerService.selectBestImage(text, {
      maxCandidates: 5,
      excludeTags: SITE_EXCLUDED_TAGS,
      excludeFilenames: exclude.map((url) => url.slice(STOCK_IMAGE_PREFIX.length)),
    });
    return `${STOCK_IMAGE_PREFIX}${picked.selectedImage.filename}`;
  } catch (err) {
    log.warn('image pick failed: %s', err instanceof Error ? err.message : String(err));
    return '';
  }
}

export async function runSiteGeneration(
  input: RunSiteGenerationInput,
  emit: (event: SiteGenerationEvent) => void
): Promise<void> {
  const { source, locale, signal } = input;
  const send = (event: SiteGenerationEvent): void => {
    if (!signal.aborted) emit(event);
  };
  const begin = (step: SiteGenerationStep): boolean => {
    if (signal.aborted) return false;
    send({ type: 'step', step });
    return !signal.aborted;
  };
  const fail = (message: string, retryable: boolean): void =>
    send({ type: 'error', message, retryable });
  let lastDraftAt = 0;
  const sendDraft = (raw: unknown, force = false): void => {
    const now = Date.now();
    if (!force && now - lastDraftAt < DRAFT_INTERVAL_MS) return;
    const content = toSiteDraft(raw);
    if (!content) return;
    lastDraftAt = now;
    send({ type: 'partial', content });
  };

  try {
    send({
      type: 'start',
      steps:
        source.kind === 'flyer' ? ['extract', 'analyze', 'write', 'images'] : ['write', 'images'],
    });

    let description: string;
    let hints: FlyerHints | null = null;
    let email = input.email;

    if (source.kind === 'flyer') {
      if (!begin('extract')) return;
      let text: string;
      try {
        text = await extractFlyerText(source.pdf);
      } catch (err) {
        log.error('flyer extraction failed:', err);
        fail(failureMessage(err, FLYER_READ_FAILED_MESSAGE), true);
        return;
      }
      if (signal.aborted) return;
      if (!text.trim()) {
        fail(FLYER_NO_TEXT_MESSAGE, false);
        return;
      }

      if (!begin('analyze')) return;
      try {
        const analysis = await analyzeFlyer(text, locale, signal);
        description = analysis.rawDescription;
        hints = { themes: analysis.themes, slogans: analysis.slogans };
        email = validEmail(analysis.contactEmail) ?? input.email;
      } catch (err) {
        log.error('flyer analysis failed:', err);
        fail(failureMessage(err, FLYER_READ_FAILED_MESSAGE), true);
        return;
      }
      if (signal.aborted) return;
    } else {
      description = source.description;
    }

    if (!begin('write')) return;
    const written = await writeSiteContent({
      description,
      hints,
      email,
      locale,
      signal,
      onPartial: (partial) => sendDraft(partial),
    });
    if (signal.aborted) return;
    if (!written.ok) {
      log.error('site content failed: %s', written.error);
      fail(failureMessage(written.cause, GENERATION_FAILED_MESSAGE), true);
      return;
    }

    if (!begin('images')) return;
    // The validated text before the first image arrives, so the preview never
    // shows a draft that validation later changed (cut lists, greeting).
    sendDraft(written.data, true);
    const content = await attachImages(written.data, pickImage, (withImages) =>
      sendDraft(withImages, true)
    );
    send({ type: 'done', content });
  } catch (err) {
    if (signal.aborted) return;
    log.error('site generation failed:', err);
    fail(failureMessage(err, GENERATION_FAILED_MESSAGE), true);
  }
}
