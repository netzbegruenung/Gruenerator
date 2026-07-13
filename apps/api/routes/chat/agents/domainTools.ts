/**
 * Domain intent tools for the agentic chat loop (Phase 2b).
 *
 * `summary`, `bundestag` and `abgeordnetenwatch` were single-pass intents whose
 * executors (`summarizeNode`, `searchNode`) already end a turn with a streamed
 * text answer written over gathered data — the "loop-shaped" criteria. Each one
 * becomes a thin tool the ONE streamText loop can call (and compose with the
 * search family): the tool runs the SAME node the single-pass path ran, emits
 * that intent's bespoke SSE from inside `execute()` (so the existing
 * summary/bundestag cards render live), and hands the model a lean value to
 * write the reply over. `bundestag` returns its structured payload verbatim so
 * the persisted step rehydrates the rich card through the unchanged
 * `threadMessageConversion` path (it looks up `toolName === 'bundestag'`).
 *
 * These mount intent-scoped (only the classified intent's tool is added) to keep
 * Mistral's catalog lean; a general per-turn catalog selector is Phase 3n.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { imageNode } from '../../../agents/langgraph/ChatGraph/nodes/imageNode.js';
import { searchNode } from '../../../agents/langgraph/ChatGraph/nodes/searchNode.js';
import { summarizeNode } from '../../../agents/langgraph/ChatGraph/nodes/summarizeNode.js';
import { PROGRESS_MESSAGES, type SSEWriter } from '../services/sseHelpers.js';

import type { ChatGraphState, SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

/**
 * `summarize`: map-reduce digest of the turn's attached documents (or, absent
 * any, the conversation) via `summarizeNode` on INTERMEDIATE_MODEL. Emits
 * `summary_start`/`summary_complete` so the progress indicator transitions
 * exactly as on the single-pass path; returns the digest for the loop model to
 * write the answer over. No citations.
 */
export function makeSummaryTool(ctx: { sse: SSEWriter; state: ChatGraphState }): Tool {
  const { sse, state } = ctx;
  return tool({
    description: `Fasst die angehängten Dokumente zusammen – oder, wenn keine vorhanden sind, den bisherigen Gesprächsverlauf.

NUTZE WENN der*die Nutzer*in um eine Zusammenfassung bittet ("fasse zusammen", "worum geht es in dem Dokument"). Rufe das Tool einmal auf und formuliere die Antwort auf Basis des zurückgegebenen Digests.`,
    inputSchema: z.object({}),
    execute: async () => {
      const documentCount = (state.documentChatIds?.length ?? 0) + (state.documentIds?.length ?? 0);
      sse.send('summary_start', { message: PROGRESS_MESSAGES.summaryStart, documentCount });
      const result = await summarizeNode(state);
      const summary = result.summaryContext ?? '';
      const timeMs = result.summaryTimeMs ?? 0;
      sse.send('summary_complete', {
        message: PROGRESS_MESSAGES.summaryComplete(summary.length, timeMs),
        summaryLength: summary.length,
        timeMs,
      });
      if (!summary) {
        return { error: 'Kein Text zum Zusammenfassen gefunden (kein Dokument, kein Verlauf).' };
      }
      return { summary };
    },
  });
}

/**
 * `bundestag`: official DIP documentation (Drucksachen, Plenarprotokolle,
 * speeches, people, Vorgänge) via `searchNode`'s bundestag branch. Emits the
 * `bundestag` SSE event with the structured payload (live rich card) and
 * registers the flat results into the source registry (done.citations footer).
 * Returns the payload verbatim: it is both the model's (human-readable) grounding
 * and the persisted step result the bundestag card rehydrates from. DE-only —
 * `searchNode` returns a graceful decline for de-AT.
 */
export function makeBundestagTool(ctx: {
  sse: SSEWriter;
  state: ChatGraphState;
  sourceRegistry: SourceRegistry;
}): Tool {
  const { sse, state, sourceRegistry } = ctx;
  return tool({
    description: `Durchsucht die offizielle Bundestags-Dokumentation (DIP): Drucksachen, Plenarprotokolle, Reden, Personen und Vorgänge.

NUTZE WENN nach Aktivitäten, Reden, Abstimmungen oder Dokumenten des Deutschen Bundestags gefragt wird. Übergib einen präzisen Suchbegriff (Person, Thema oder Drucksachennummer). Nur für Deutschland verfügbar.`,
    inputSchema: z.object({
      query: z.string().min(1).describe('Suchbegriff: Person, Thema oder Drucksachennummer'),
    }),
    execute: async ({ query }) => {
      const result = await searchNode({ ...state, intent: 'bundestag', searchQuery: query });
      const payload = result.bundestagResult ?? null;
      const results = (result.searchResults ?? []) as SearchResult[];
      if (payload) sse.send('bundestag', { bundestag: payload });
      // Flat results feed the [N] citation footer (done.citations); the rich
      // card renders from the `bundestag` event and the persisted payload.
      if (results.length > 0) sourceRegistry.register(results);
      if (!payload) {
        return { note: results[0]?.content ?? 'Keine passenden Bundestags-Daten gefunden.' };
      }
      // Returned verbatim: persisted (→ bundestag card rehydration via
      // bundestagPayloadSchema) AND the model's grounding (its `notes`/blocks
      // are human-readable). wrapTools truncates the model-facing copy only.
      return payload;
    },
  });
}

/**
 * `abgeordnetenwatch`: mandate and voting data (voting record, side jobs,
 * mandates) via `searchNode`'s abgeordnetenwatch branch. The lightest of the
 * three — no bespoke event, no rich card: the enriched result is already
 * flattened to `SearchResult[]`, so it behaves like the search family (register
 * → lean `{ resultCount, sources }`). DE-only.
 */
export function makeAbgeordnetenwatchTool(ctx: {
  state: ChatGraphState;
  sourceRegistry: SourceRegistry;
}): Tool {
  const { state, sourceRegistry } = ctx;
  return tool({
    description: `Ruft Mandats- und Abstimmungsdaten von abgeordnetenwatch.de ab: Abstimmungsverhalten, Nebentätigkeiten und Mandate einzelner Abgeordneter.

NUTZE WENN nach dem Abstimmungsverhalten, den Nebentätigkeiten oder dem Mandat einer*eines konkreten Abgeordneten gefragt wird. Übergib den Namen der Person (oder ein Thema). Nur für Deutschland verfügbar.`,
    inputSchema: z.object({
      query: z.string().min(1).describe('Name der*des Abgeordneten oder ein Thema'),
    }),
    execute: async ({ query }) => {
      const result = await searchNode({
        ...state,
        intent: 'abgeordnetenwatch',
        searchQuery: query,
      });
      const results = (result.searchResults ?? []) as SearchResult[];
      if (results.length === 0) {
        return { resultCount: 0, sources: '', error: 'Keine passenden Mandatsdaten gefunden.' };
      }
      const sources = sourceRegistry.register(results);
      return { resultCount: results.length, sources: sources ?? '' };
    },
  });
}

/**
 * `generate_image`: Flux image generation via `imageNode`. Emits
 * `image_start`/`image_complete` (the latter carries the full image incl.
 * base64 for the live card). `imageNode` derives subject+style from the last
 * user message, so the model's `prompt` is injected as a synthetic trailing
 * user message — that lets the loop steer the image (e.g. from search results).
 * The result is merged back onto the shared state so the router persists it via
 * the message-level `generatedImage` metadata (its rehydration path); the model
 * only gets a lean confirmation (no base64). `image_edit` stays single-pass —
 * it needs an attachment and the router gate excludes attachment turns.
 */
export function makeImageTool(ctx: { sse: SSEWriter; state: ChatGraphState }): Tool {
  const { sse, state } = ctx;
  return tool({
    description: `Generiert ein Bild (Illustration, Foto-Stil oder Sharepic-Motiv) aus einer Beschreibung.

NUTZE WENN der*die Nutzer*in ein Bild/Motiv/eine Illustration erzeugt haben möchte ("mach/generiere/zeichne ein Bild von ..."). Übergib eine präzise Bildbeschreibung auf Deutsch.`,
    inputSchema: z.object({
      prompt: z.string().min(1).describe('Bildbeschreibung (Motiv, Stil, Details)'),
    }),
    execute: async ({ prompt }) => {
      sse.send('image_start', { message: PROGRESS_MESSAGES.imageStart });
      const injected = { role: 'user', content: prompt } as ChatGraphState['messages'][number];
      const result = await imageNode({ ...state, messages: [...state.messages, injected] });
      // Mirror the single-pass merge so the router persists the image through
      // the message-level generatedImage metadata (state is the shared ref).
      state.generatedImage = result.generatedImage ?? null;
      if (state.generatedImage) {
        sse.send('image_complete', {
          message: PROGRESS_MESSAGES.imageComplete,
          image: state.generatedImage,
        });
        return {
          ok: true,
          prompt: state.generatedImage.prompt,
          style: state.generatedImage.style,
        };
      }
      const err = result.error ?? 'Bildgenerierung fehlgeschlagen.';
      sse.send('image_complete', { message: PROGRESS_MESSAGES.imageError(err), error: err });
      return { error: err };
    },
  });
}
