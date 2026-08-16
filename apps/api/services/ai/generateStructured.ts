/**
 * Schema-enforced structure generation for the create_* artifact kinds.
 *
 * Background: artifact generators used to prompt for JSON and parse whatever
 * came back. When the model omitted a required field the parse failed, the
 * generator returned null, and the turn degraded into free prose — which then
 * became the input of the NEXT artifact. Prompting alone cannot prevent that.
 *
 * The mechanism is a forced tool call (`options.tools` + `tool_choice:
 * 'required'`), which several services already use as de-facto structured
 * output — see runSharepicEdit (sharepicEditLlm.ts) and runCanvasSuggest. This
 * is that pattern, generalized, plus two additions:
 *
 *  - a REPAIR turn: the invalid output and the concrete validation error are
 *    fed back at temperature 0 ("field X missing — return it corrected"), which
 *    is what actually recovers a missing required field;
 *  - a TEXT fallback: a provider that ignores tools and answers with prose is
 *    still parsed before the attempt counts as failed, so the behaviour is a
 *    strict superset of the pre-tool-call one and no provider can regress.
 *
 * ── One validator, two transports ───────────────────────────────────────────
 * The tool call and the text answer are TRANSPORTS of the same payload; they
 * differ only in how the candidate object is obtained. Both therefore run
 * through the caller's `validate`.
 *
 * This used to be two paths: `validate` for the tool call and a separate
 * `parseText` for prose. They drifted, in both directions that matter:
 *  - the text path returned a bare `null`, so a rejection there was reported as
 *    "Kein Tool-Aufruf in der Antwort" and the repair turn never learned the
 *    actual field error. A PDF generation died in production this way — the
 *    model sent `caption: null` twice and was never told;
 *  - the presentation generator's `validate` rejects decks with EMPTY SLIDES,
 *    but its `parseText` was the bare parser — so whenever the provider
 *    answered with prose (the common case on the model this ran on) the
 *    quality gate was silently skipped and the empty deck shipped.
 *
 * ── Why not the SDK's `generateObject` ──────────────────────────────────────
 * Reviewed 16.08.2026 against **ai@7.0.58** — the version `pnpm-lock.yaml`
 * resolves for `apps/api` (specifier ^7.0.58), i.e. what CI and production
 * install. Read out of that package's `dist/index.d.ts`, not recalled. (A local
 * `node_modules` can lag the lockfile and served 7.0.37 while this was written;
 * both facts below are identical in the two, but the lockfile is the version
 * that counts.) Two SDK facts:
 *
 *  - `experimental_repairText` DOES exist here, so version is not the obstacle.
 *    Its contract is. It is `({text, error: JSONParseError |
 *    TypeValidationError}) => Promise<string | null>`: it sees the raw text and
 *    repairs it so JSON parsing succeeds. It never sees a well-formed object
 *    that a SEMANTIC gate rejected, and it cannot take another model turn.
 *  - `generateObject` itself is marked `@deprecated Use generateText with an
 *    output setting instead` in this version, so it is not the migration target
 *    it looks like.
 *
 * That is the whole reason this module stays. `validate` here is not a schema
 * check — it rejects on grounds a schema cannot express (a deck whose slides are
 * empty, an editor operation the canvas cannot perform) and its MESSAGE is fed
 * back as the repair prompt. Neither `generateObject` nor `Output.object()` has
 * a slot for a complaint about a schema-perfect but wrong answer. `viaLaxParser`
 * compounds it: the callers' existing normalizing parsers run on both transports
 * so the two cannot drift, which a schema-validated return value would undo.
 *
 * What IS a real duplicate, and the actual consolidation target: `aiObject` in
 * `services/ai/generate.ts` implements this same forced-tool-call + validate +
 * repair pattern against the lane registry. It has no production callers; this
 * module has three (artifactGeneration, docsContractRouter, runCanvasSuggest)
 * plus the text-fallback machinery they depend on. Merging means moving that
 * machinery into `aiObject`, not deleting either — a change of its own.
 */

import { jsonSchema } from 'ai';

import { createLogger } from '../../utils/logger.js';

import type { AiClient, AiResult, Tool } from './types.js';

const log = createLogger('GenerateStructured');

const DEFAULT_ATTEMPTS = 2;

/**
 * NOTE ON THE MODEL: this module deliberately sets NO provider and NO model.
 *
 * The forced tool call only works on a model that makes one — GPT-OSS does
 * not, which is what the text fallback below spent its life compensating for.
 * That choice belongs to `providerSelector` (the creation types route to
 * Mistral Medium 3.5), not here: a top-level `provider` on the request picks
 * the ADAPTER without picking a matching model, which is how another route
 * ended up posting a verdigado alias at the Mistral API (see routes/texte/
 * website.ts).
 */

/**
 * Above this the previous attempt is NOT echoed back into the repair turn.
 *
 * The old code truncated the echo to 2000 chars and then asked for a complete
 * document — so the model saw its own output ending mid-block and "corrected"
 * the truncation. Showing nothing and naming the error is the honest version.
 */
const MAX_ECHO_CHARS = 12_000;

/** Caller-supplied gate. Returning an error message drives the repair turn. */
export type StructuredValidation<T> = { ok: true; value: T } | { ok: false; error: string };

export interface GenerateStructuredOptions<T> {
  aiClient: AiClient;
  req?: unknown;
  /** Request type, e.g. 'doc_generation' — drives model routing. */
  type: string;
  systemPrompt: string;
  userContent: string;
  toolName: string;
  toolDescription: string;
  /**
   * JSON Schema shown to the MODEL. Keep it loose (few required fields, no deep
   * anyOf): strict provider schema modes reject `default`, and gpt-oss/mistral
   * handle deeply nested unions poorly. The strictness lives in `validate`.
   */
  schema: Record<string, unknown>;
  /**
   * The single gate. Runs on the tool call AND on JSON recovered from a text
   * answer — see "One validator, two transports" above.
   */
  validate: (input: unknown) => StructuredValidation<T>;
  attempts?: number;
  temperature?: number;
  /** Log prefix, e.g. 'pdf'. */
  label: string;
}

export type GenerateStructuredResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Bridge an existing lax parser into the `validate` slot.
 *
 * Those parsers take a JSON STRING and NORMALIZE rather than reject (casting,
 * capping, dropping malformed entries). Round-tripping the tool call's object
 * through JSON.stringify reuses that exact normalization for both the tool path
 * and the text-fallback path, so the two cannot drift — and it keeps the forced
 * tool call from making generation STRICTER than before, which would turn
 * today's repairable output into new failures.
 */
export function viaLaxParser<T>(
  parse: (raw: string) => T | null,
  missing: string
): (input: unknown) => StructuredValidation<T> {
  return (input: unknown) => {
    const value = parse(JSON.stringify(input));
    return value ? { ok: true, value } : { ok: false, error: missing };
  };
}

/**
 * Adapt a parser that never returns null but signals failure with empty
 * content (parseDocumentResponse) into the null-on-failure shape.
 */
export function withContent<T extends { content: string }>(
  parse: (raw: string) => T
): (raw: string) => T | null {
  return (raw: string) => {
    const parsed = parse(raw);
    return parsed.content ? parsed : null;
  };
}

/**
 * JSON candidates from a text answer, in the order they were tried before:
 * the bare body, a fenced block, then the widest `{…}` in the prose. Only
 * candidates that PARSE are yielded — validation is the caller's job, so a
 * rejection carries the field path instead of vanishing into a `null`.
 */
export function jsonCandidatesFromText(text: string): unknown[] {
  // Deduplicated: a bare JSON body matches the plain and the braced shape
  // alike, and validating the identical string twice is what produced the
  // duplicated "structure rejected" lines that made the logs hard to read.
  const raws = new Set([text.trim()]);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) raws.add(fenced[1].trim());
  const braced = text.match(/\{[\s\S]*\}/);
  if (braced) raws.add(braced[0]);

  const parsed: unknown[] = [];
  for (const raw of raws) {
    try {
      parsed.push(JSON.parse(raw));
    } catch {
      // Not this shape — try the next.
    }
  }
  return parsed;
}

function extractToolInput(result: AiResult, toolName: string): Record<string, unknown> | null {
  if (result.tool_calls) {
    const match = result.tool_calls.find((c) => c.name === toolName);
    if (match) return match.input;
  }
  if (result.raw_content_blocks) {
    for (const block of result.raw_content_blocks) {
      if (block.type === 'tool_use' && block.name === toolName && block.input) return block.input;
    }
  }
  return null;
}

export async function generateStructured<T>(
  opts: GenerateStructuredOptions<T>
): Promise<GenerateStructuredResult<T>> {
  const {
    aiClient,
    req,
    type,
    systemPrompt,
    userContent,
    toolName,
    toolDescription,
    schema,
    validate,
    label,
  } = opts;
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS;

  // The AI SDK's asSchema helper rejects raw JSON-Schema objects — wrap first
  // (same as runSharepicEdit / runCanvasSuggest).
  const tool: Tool = {
    name: toolName,
    description: toolDescription,
    input_schema: jsonSchema(
      schema as Parameters<typeof jsonSchema>[0]
    ) as unknown as Tool['input_schema'],
  };

  let lastError = '';
  let lastRaw = '';
  /** Best structure recovered from a CUT-OFF answer, used only if every
   *  attempt was cut off (see the return at the bottom). */
  let truncatedFallback: T | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const isRepair = attempt > 1 && lastError !== '';
    const messages = isRepair
      ? [
          { role: 'user', content: userContent },
          // Echo the rejected attempt so the model corrects rather than rewrites
          // — but only when it fits whole (see MAX_ECHO_CHARS).
          ...(lastRaw && lastRaw.length <= MAX_ECHO_CHARS
            ? [{ role: 'assistant', content: lastRaw }]
            : []),
          {
            role: 'user',
            content:
              `Deine Ausgabe war ungültig: ${lastError}\n\n` +
              `Gib sie korrigiert und VOLLSTÄNDIG erneut über das Tool ${toolName} aus. ` +
              'Lass kein Pflichtfeld weg und kürze den Inhalt nicht.',
          },
        ]
      : [{ role: 'user', content: userContent }];

    try {
      const result = await aiClient.processRequest(
        {
          type,
          systemPrompt,
          messages,
          options: {
            tools: [tool],
            tool_choice: 'required',
            // A repair runs deterministically — creativity already failed once.
            temperature: isRepair ? 0 : (opts.temperature ?? 0.4),
          },
        },
        req as Parameters<AiClient['processRequest']>[1]
      );

      if (!result.success) {
        lastError = result.error || 'AI request failed';
        log.warn(`[${label}] attempt ${attempt} provider error: ${lastError}`);
        continue;
      }

      // Two transports, one payload. A provider that ignores the tool still
      // answers with the JSON in prose — that was the only path before tool
      // calls existed, so it stays, but it now goes through the SAME gate.
      const toolInput = extractToolInput(result, toolName);
      const transport = toolInput ? 'tool call' : 'text';
      const candidates = toolInput ? [toolInput] : jsonCandidatesFromText(result.content ?? '');

      // The provider ran out of output budget mid-structure. What comes back is
      // a TORSO, and the lax parsers normalize rather than reject — they drop
      // the malformed tail and hand back what parsed, which then ships as a
      // deck missing its last slides or a document missing its second half.
      // Live on 03.08.2026: 4096 tokens exhausted, "recovered from text",
      // success reported. Treat it as a rejection so the repair turn happens.
      //
      // `stop_reason === 'length'` misses one shape of the same failure: with
      // `tool_choice: 'required'` (always set above), a provider that cuts the
      // tool call's argument JSON off mid-stream can still report a "tool
      // call" finish reason (mapped to stop_reason 'tool_use', see
      // adapterUtils.ts) — the SDK just can't parse the truncated arguments,
      // so `toolInput` is null AND there's no text to fall back to
      // (`candidates` empty). That reads as "no tool call, no JSON" and hit
      // the generic unhelpful error instead of the repair-then-torso path
      // below. Live on 06.08.2026: board_generation, stop_reason=tool_use.
      //
      // Gated on stop_reason === 'tool_use' specifically (not just "no
      // candidates"), so a model that genuinely ignored the tool and wrote
      // unrelated prose — a real rejection, not a truncation — still falls
      // through to the generic error a few lines down instead of being
      // mistaken for a cut-off tool call.
      const noToolDespiteForced =
        !toolInput && candidates.length === 0 && result.stop_reason === 'tool_use';
      const truncated = result.stop_reason === 'length' || noToolDespiteForced;

      let rejection = '';
      let rejected = '';
      for (const candidate of candidates) {
        const validated = validate(candidate);
        if (validated.ok) {
          if (truncated) {
            // Keep it as a last resort — see the fallback return below. Half a
            // document the user can finish beats no document at all, but only
            // after the repair attempt had its chance.
            if (!truncatedFallback) truncatedFallback = validated.value;
            log.warn(
              `[${label}] attempt ${attempt}: structure parsed but the answer was CUT OFF ` +
                `(stop_reason=length) — retrying for a complete one`
            );
            break;
          }
          if (!toolInput) {
            log.info(`[${label}] attempt ${attempt}: no tool call, recovered from text`);
          }
          return { ok: true, data: validated.value };
        }
        // Report the FIRST candidate that parsed: with prose around the JSON
        // the bare body fails to parse and the fenced block is the real answer.
        if (!rejection) {
          rejection = validated.error;
          rejected = JSON.stringify(candidate);
        }
      }

      if (truncated) {
        // Echoing a cut-off draft back would make the model "correct" the cut
        // (see MAX_ECHO_CHARS); naming the cause and asking for less is what
        // actually fits inside the budget.
        lastError =
          'Die Ausgabe wurde abgeschnitten (Token-Limit erreicht) und war deshalb unvollständig';
        lastRaw = '';
        continue;
      }

      if (rejection) {
        lastError = rejection;
        lastRaw = rejected;
        log.warn(
          `[${label}] attempt ${attempt} rejected (${transport}): ${lastError}\n` +
            `  raw: ${rejected.slice(0, 600)}`
        );
        continue;
      }

      lastError = 'Kein Tool-Aufruf und kein verwertbares JSON in der Antwort';
      lastRaw = '';
      log.warn(
        `[${label}] attempt ${attempt}: ${lastError} (stop_reason=${result.stop_reason ?? 'unknown'})`
      );
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      log.error(`[${label}] attempt ${attempt} threw: ${lastError}`);
    }
  }

  // Every attempt was cut off, but one of them parsed. Ship it: half a document
  // the person can finish beats none at all — the same call `createPdfDocument`
  // already makes for its own repair round ("deliver the file and disclose the
  // problem"). The WARN above is what makes it findable afterwards.
  if (truncatedFallback) {
    log.warn(`[${label}] all attempts were cut off — using the last complete-parsing torso`);
    return { ok: true, data: truncatedFallback };
  }

  return { ok: false, error: lastError || 'unbekannter Fehler' };
}
