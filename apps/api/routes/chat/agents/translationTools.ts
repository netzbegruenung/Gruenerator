/**
 * `text_uebersetzen` — machine translation via DeepL for the agentic loop.
 *
 * One tool, no action enum: translating is the only thing it does, and the
 * language list lives in the description rather than a second `sprachen`
 * action (the catalog is the biggest token item of every call; a lookup
 * action would cost a schema on every turn for a fact the model already has).
 *
 * Goes through `translateWithGlossary` like the page, so the account glossary,
 * the per-user budget and DeepL's quota semantics are identical in both doors.
 * The facade is injectable so the test runs without DeepL, Redis or a key.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import {
  TEXT_MAX_CHARS,
  translateWithGlossary,
  translationErrorMessage,
} from '../../../services/translation/translate.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

export interface TranslationToolCtx {
  state: ChatGraphState;
  /** Injected in tests; defaults to the real facade. */
  translate?: typeof translateWithGlossary;
}

const NO_SESSION = 'Keine Nutzer-Sitzung — Übersetzungen brauchen eine angemeldete Person.';

export function makeTranslateTool(ctx: TranslationToolCtx): Tool {
  const { state } = ctx;
  const translate = ctx.translate ?? translateWithGlossary;
  return tool({
    description: `Übersetzt einen Text maschinell mit DeepL in eine andere Sprache. Das Grünen-Glossar (feste Begriffe wie Parteinamen) wird automatisch angewendet, wenn es das Sprachpaar abdeckt.

NUTZE FÜR: Übersetzungen in Fremdsprachen oder aus ihnen — mehrsprachige Flyer, fremdsprachige Anfragen beantworten, Zitate aus englischen Quellen ins Deutsche, einen fertigen deutschen Text ins Englische/Türkische/Arabische. Schreibe den Text ZUERST fertig auf Deutsch und übersetze dann das Ergebnis; übergib den vollständigen Text in einem Aufruf.

NICHT für Einfache oder Leichte Sprache, Umformulierungen, Kürzungen oder Stiländerungen innerhalb derselben Sprache — das machst du selbst.

Gib die Übersetzung wörtlich wieder, ohne sie nachzubessern. Zielsprachen als DeepL-Code: EN-GB, EN-US, FR, ES, IT, NL, PL, TR, UK, RU, AR, PT-PT, PT-BR, DA, SV, NB, FI, CS, EL, HU, RO, JA, KO, ZH-HANS, DE.`,
    inputSchema: z.object({
      text: z
        .string()
        .min(1)
        .max(TEXT_MAX_CHARS)
        .describe('Der zu übersetzende Text — vollständig und unverändert'),
      zielsprache: z
        .string()
        .min(2)
        .max(10)
        .describe('Zielsprache als DeepL-Code, z. B. EN-GB, FR, TR, AR, DE'),
      quellsprache: z
        .string()
        .min(2)
        .max(10)
        .optional()
        .describe('Quellsprache als Code (DE, EN, FR …). Weglassen, dann erkennt DeepL sie.'),
      formalitaet: z
        .enum(['default', 'more', 'less'])
        .optional()
        .describe(
          "'more' = förmlich (Sie), 'less' = vertraut (du). Nur für Sprachen mit Höflichkeitsformen (DE, FR, ES, IT, NL, PL, PT, RU, JA)."
        ),
    }),
    execute: async ({ text, zielsprache, quellsprache, formalitaet }) => {
      const userId = state.agentConfig?.userId ?? null;
      if (!userId) return { error: NO_SESSION };
      try {
        const result = await translate({
          userId,
          text,
          targetLang: zielsprache,
          sourceLang: quellsprache ?? null,
          formality: formalitaet ?? null,
        });
        return {
          uebersetzung: result.text,
          erkannteQuellsprache: result.detectedSourceLang,
          zielsprache: result.targetLang,
          zeichen: result.billedCharacters,
          glossarAngewendet: result.glossaryApplied,
        };
      } catch (error) {
        return { error: translationErrorMessage(error) };
      }
    },
  });
}
