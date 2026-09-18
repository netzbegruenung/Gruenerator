/**
 * The one translation door the page AND the chat tool go through.
 *
 * Glossary handling is the reason this exists as its own step: DeepL only
 * applies a glossary with an explicit `source_lang`, but it only DETECTS the
 * source without one. So with source "auto" we translate once without the
 * glossary, read the detected language off the full text, and translate a
 * second time only when a dictionary covers the detected pair — no extra
 * cost when none does, and detection on the whole text rather than a probe.
 */
import { createLogger } from '../../utils/logger.js';
import { getTreeBudget } from '../trees/index.js';
import {
  toTreeBudgetStatusDto,
  TreeBudgetExceededError,
  TreeBudgetUnavailableError,
  type TreeBudget,
} from '../trees/treeBudget.js';
import { treeCostForChars } from '../trees/treeCosts.js';

import {
  DeepLError,
  getDeepLService,
  rootLang,
  type DeepLFormality,
  type DeepLService,
} from './DeepLService.js';
import { glossaryIdFor, resolveGlossary, type GlossaryInfo } from './glossaryRegistry.js';

import type { TreeBudgetStatus } from '@gruenerator/contracts';

const log = createLogger('Translate');

/** Well under DeepL's 128 KiB request limit even for multi-byte text. */
export const TEXT_MAX_CHARS = 50_000;

export type TranslationFormality = Extract<DeepLFormality, 'default' | 'more' | 'less'>;

export class TranslationUnavailableError extends Error {
  constructor() {
    super('Die Übersetzung ist auf diesem Server nicht eingerichtet.');
    this.name = 'TranslationUnavailableError';
  }
}

export interface TranslateParams {
  userId: string;
  text: string;
  targetLang: string;
  /** `null`, `''` or `'auto'` → DeepL detects. */
  sourceLang?: string | null;
  formality?: TranslationFormality | null;
}

export interface TranslateResult {
  text: string;
  detectedSourceLang: string;
  targetLang: string;
  billedCharacters: number;
  glossaryApplied: boolean;
  quota: TreeBudgetStatus;
}

export interface TranslateDeps {
  service?: DeepLService | null;
  glossary?: (service: DeepLService) => Promise<GlossaryInfo | null>;
  budget?: Pick<TreeBudget, 'reserveOrThrow' | 'adjust' | 'release'>;
}

export function explicitSource(sourceLang: string | null | undefined): string | null {
  const trimmed = sourceLang?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'auto') return null;
  return trimmed;
}

/** Glossary lookup must never break a translation — log and go without. */
async function glossaryOrNull(
  service: DeepLService,
  resolve: NonNullable<TranslateDeps['glossary']>
): Promise<GlossaryInfo | null> {
  try {
    return await resolve(service);
  } catch (error) {
    log.warn(
      `[Translate] glossary lookup failed, translating without: ${(error as Error).message}`
    );
    return null;
  }
}

export async function translateWithGlossary(
  params: TranslateParams,
  deps: TranslateDeps = {}
): Promise<TranslateResult> {
  const service = deps.service === undefined ? getDeepLService() : deps.service;
  if (!service) throw new TranslationUnavailableError();
  if (params.text.length > TEXT_MAX_CHARS) {
    throw new RangeError(`Text länger als ${TEXT_MAX_CHARS} Zeichen`);
  }

  // Booked on the text length before DeepL sees it, corrected to what DeepL
  // actually billed afterwards — the estimate is exact for plain text and too
  // low only when a glossary forces a second pass.
  const budget = deps.budget ?? getTreeBudget();
  const reserved = treeCostForChars(params.text.length);
  const { day } = await budget.reserveOrThrow(params.userId, reserved);

  const glossary = await glossaryOrNull(service, deps.glossary ?? resolveGlossary);
  const formality = params.formality ?? null;
  const source = explicitSource(params.sourceLang);

  let text: string;
  let detectedSourceLang: string;
  let billed = 0;
  let glossaryApplied = false;

  try {
    if (source) {
      const glossaryId = glossaryIdFor(glossary, source, params.targetLang);
      const [t] = await service.translateText({
        text: [params.text],
        targetLang: params.targetLang,
        sourceLang: source,
        formality,
        glossaryId,
      });
      text = t!.text;
      detectedSourceLang = t!.detectedSourceLang || rootLang(source);
      billed = t!.billedCharacters;
      glossaryApplied = glossaryId !== null;
    } else {
      const [first] = await service.translateText({
        text: [params.text],
        targetLang: params.targetLang,
        formality,
      });
      text = first!.text;
      detectedSourceLang = first!.detectedSourceLang;
      billed = first!.billedCharacters;
      const glossaryId = glossaryIdFor(glossary, detectedSourceLang, params.targetLang);
      if (glossaryId) {
        const [second] = await service.translateText({
          text: [params.text],
          targetLang: params.targetLang,
          sourceLang: detectedSourceLang,
          formality,
          glossaryId,
        });
        text = second!.text;
        billed += second!.billedCharacters;
        glossaryApplied = true;
      }
    }
  } catch (error) {
    // A failing SECOND (glossary) pass gives the whole reservation back although
    // the first pass was billed — deliberate: user-favourable and rare.
    await budget.release(params.userId, reserved, day);
    throw error;
  }

  const quota = toTreeBudgetStatusDto(
    await budget.adjust(
      params.userId,
      treeCostForChars(billed || params.text.length) - reserved,
      day
    )
  );
  return {
    text,
    detectedSourceLang,
    targetLang: params.targetLang,
    billedCharacters: billed,
    glossaryApplied,
    quota,
  };
}

/** German, user-facing sentence for whatever the translation path threw. */
export function translationErrorMessage(error: unknown): string {
  if (error instanceof TreeBudgetExceededError) return error.message;
  if (error instanceof TreeBudgetUnavailableError) return error.message;
  if (error instanceof TranslationUnavailableError) return error.message;
  if (error instanceof RangeError) return error.message;
  if (error instanceof DeepLError) {
    if (error.quotaExhausted) {
      return 'Das DeepL-Kontingent des Grünerators ist für diesen Abrechnungszeitraum erschöpft.';
    }
    if (error.status === 400) return `DeepL hat die Anfrage abgelehnt: ${error.message}`;
    return 'DeepL ist gerade nicht erreichbar. Bitte in ein paar Minuten erneut versuchen.';
  }
  return 'Die Übersetzung ist fehlgeschlagen.';
}
