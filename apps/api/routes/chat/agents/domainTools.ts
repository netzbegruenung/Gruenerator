/**
 * Domain intent tools for the agentic chat loop (Phase 2b).
 *
 * `summary`, `bundestag` and `abgeordnetenwatch` were single-pass intents whose
 * executors (`summarizeNode`, `searchNode`) already end a turn with a streamed
 * text answer written over gathered data — the "loop-shaped" criteria. Each one
 * becomes a thin tool the ONE streamText loop can call (and compose with the
 * search family): the tool runs the SAME node the single-pass path ran and
 * hands the model a lean value to write the reply over. `bundestag` and
 * `abgeordnetenwatch` behave like the search family (register into the source
 * registry → lean `{ resultCount, sources }`), so their hits show up in the
 * standard citations footer and the model cites them with [N] markers.
 *
 * These mount broadly on loop turns (see `toolCatalog.ts`) so the model can
 * pick them even when the classifier routed to plain `search`; a general
 * per-turn catalog selector is Phase 3n.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { imageNode } from '../../../agents/langgraph/ChatGraph/nodes/imageNode.js';
import { searchNode } from '../../../agents/langgraph/ChatGraph/nodes/searchNode.js';
import { summarizeNode } from '../../../agents/langgraph/ChatGraph/nodes/summarizeNode.js';
import { relatedDocsPages, searchDocs } from '../../../services/docs/docsIndex.js';
import { lookupUmfragen } from '../../../services/monitor/UmfragenService.js';
import {
  withResearchedSources,
  type SourceRegistry,
} from '../services/agenticLoop/sourceRegistry.js';
import { buildCreateTurnContext, withConversationContext } from '../services/createTurn.js';
import {
  pdfKindFromText,
  runBoardGeneration,
  runDocGeneration,
  runPdfGeneration,
  runSharepicGeneration,
} from '../services/intentExecutionService.js';
import { PROGRESS_MESSAGES, type SSEWriter } from '../services/sseHelpers.js';

import type { ChatGraphState, SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';
import type { Request } from 'express';

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
 * speeches, people, Vorgänge) via `searchNode`'s bundestag branch. Behaves like
 * the search family: registers the flat results into the source registry and
 * returns the lean `{ resultCount, sources }` — the numbered snippet block is
 * the model's grounding, the citations footer shows the documents. Speech
 * excerpts run up to ~600 chars upstream, so registration raises the snippet
 * cap to 700 to keep them intact. DE-only — `searchNode` returns a graceful
 * decline for de-AT.
 */
export function makeBundestagTool(ctx: {
  state: ChatGraphState;
  sourceRegistry: SourceRegistry;
}): Tool {
  const { state, sourceRegistry } = ctx;
  return tool({
    description: `Durchsucht die offizielle Bundestags-Dokumentation (DIP): Drucksachen, Plenarprotokolle, Reden, Personen und Vorgänge.

NUTZE WENN nach Aktivitäten, Reden, Abstimmungen oder Dokumenten des Deutschen Bundestags gefragt wird. Übergib einen präzisen Suchbegriff (Person, Thema oder Drucksachennummer). Nur für Deutschland verfügbar.`,
    inputSchema: z.object({
      query: z.string().min(1).describe('Suchbegriff: Person, Thema oder Drucksachennummer'),
    }),
    execute: async ({ query }) => {
      const result = await searchNode({ ...state, intent: 'bundestag', searchQuery: query });
      const results = (result.searchResults ?? []) as SearchResult[];
      if (results.length === 0) {
        return { resultCount: 0, sources: '', error: 'Keine passenden Bundestags-Daten gefunden.' };
      }
      const sources = sourceRegistry.register(results);
      return { resultCount: results.length, sources: sources ?? '' };
    },
  });
}

/**
 * `abgeordnetenwatch`: mandate and voting data (voting record, side jobs,
 * mandates) via `searchNode`'s abgeordnetenwatch branch. Same shape as
 * `bundestag`: register → lean `{ resultCount, sources }`. DE-only.
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
 * `umfragen`: Wahlumfragen (Sonntagsfrage via PolitPro, national + Bundesländer
 * + AT-Parlamente) und themenbezogenes Meinungsbild (MRP/GERDA) — the same
 * `lookupUmfragen` the Monitor uses. Registers one source for the [N] footer
 * and returns the full formatted block as the model's grounding.
 */
export function makeUmfragenTool(ctx: { sourceRegistry: SourceRegistry }): Tool {
  const { sourceRegistry } = ctx;
  return tool({
    description: `Ruft aktuelle Wahlumfragen ab: Sonntagsfrage (Parteiwerte, bundesweit oder pro Bundesland/Österreich) und themenbezogene Meinungsbilder.

NUTZE WENN nach Umfragewerten, der Sonntagsfrage oder der Zustimmung zu einem Thema gefragt wird ("wie stehen die Grünen in Umfragen", "Sonntagsfrage Bayern"). NICHT für Parteipositionen oder Wahlergebnisse.`,
    inputSchema: z.object({
      topic: z
        .string()
        .describe(
          'Thema für das Meinungsbild (z.B. "Klimaschutz"); leer für die reine Sonntagsfrage'
        )
        .default(''),
      bundesland: z
        .string()
        .optional()
        .describe(
          'Bundesland/Region für die Sonntagsfrage (z.B. "Bayern"); weglassen für bundesweit'
        ),
    }),
    execute: async ({ topic, bundesland }) => {
      const text = await lookupUmfragen(topic ?? '', bundesland).catch(() => null);
      if (!text) {
        return { resultCount: 0, sources: '', error: 'Keine Umfragedaten verfügbar.' };
      }
      const sources = sourceRegistry.register([
        {
          source: 'umfragen',
          title: `Wahlumfragen${bundesland ? ` ${bundesland}` : ''} (PolitPro)`,
          content: text,
          url: 'https://politpro.eu',
        },
      ]);
      return { resultCount: 1, sources: sources ?? '', umfragen: text };
    },
  });
}

/**
 * `gruenerator_docs_search`: BM25 over the Grünerator user documentation
 * (doku.gruenerator.eu), the retrieval half of the `hilfe` intent.
 *
 * The prompt half is the page MAP (`buildDocsPageMap`, injected by respondNode)
 * — the two are complementary, not redundant: the map lists every page so the
 * model can point at the right one, this tool pulls the actual section text so
 * it can answer the question. Hits go through the source registry like any
 * search tool, so the sections become numbered `[N]` citations that deep-link
 * to `…/docs/page#section`.
 *
 * Purely in-process (a generated index, no network, no embeddings), so it is
 * cheap enough to call speculatively and works in tests without fixtures.
 */
export function makeDocsSearchTool(ctx: { sourceRegistry: SourceRegistry }): Tool {
  const { sourceRegistry } = ctx;
  return tool({
    description: `Durchsucht die offizielle Grünerator-Dokumentation (Anleitungen, Hilfeseiten, Funktionsbeschreibungen) und liefert Abschnitte mit direkt verlinkbaren Fundstellen.

NUTZE WENN es um die BEDIENUNG des Grünerators geht: "wie erstelle ich ein Sharepic", "wie lege ich ein Notebook an", "wie binde ich die Grüne Wolke ein", "was ist die Agentura", "wo finde ich die Konnektoren".

NICHT für politische Inhalte oder Parteiprogramme (nutze gruenerator_search), nicht für allgemeine Web-Recherche (nutze web_search), nicht für die eigenen Dokumente der Nutzer*innen.

Verlinke die gefundenen Seiten in der Antwort mit ihrer vollständigen URL.`,
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe('Suchbegriff oder Frage zur Grünerator-Bedienung, auf Deutsch'),
    }),
    execute: async ({ query }) => {
      const hits = searchDocs(query, 5);
      if (hits.length === 0) {
        return {
          resultCount: 0,
          sources: '',
          note: 'Zu dieser Frage steht nichts in der Grünerator-Dokumentation. Sage das ehrlich, statt eine Anleitung zu erfinden.',
        };
      }
      const results: SearchResult[] = hits.map((hit) => ({
        source: 'gruenerator-docs',
        url: hit.url,
        title: hit.title,
        content: hit.snippet,
      }));
      const sources = sourceRegistry.register(results);
      return {
        resultCount: results.length,
        sources: sources ?? '',
        // Unlike the other search tools, this one KEEPS a (lean) results array.
        // The registry's `sources` block is `[N] title — snippet` with no URL,
        // and linking the right doc page is the entire point of this tool — the
        // model cannot write a link it was never given. Title+URL only, so the
        // token cost stays ~15 per hit. It also gives the tool card something to
        // render (parseSearchCitations reads `results`).
        results: hits.map((hit) => ({ title: hit.title, url: hit.url })),
        // Page-level neighbours so the model can offer "mehr dazu" without a
        // second call.
        verwandteSeiten: relatedDocsPages(query),
      };
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
      // Idempotent per turn: the loop model can't SEE the image it made and
      // tends to re-call ("try again"), which burns the daily image quota (seen
      // live: 3 generations for one request). If we already produced one this
      // turn, acknowledge success instead of generating again.
      if (state.generatedImage) {
        return {
          ok: true,
          note: 'Es wurde in diesem Turn bereits ein Bild erstellt und dem*der Nutzer*in angezeigt. Rufe generate_image NICHT erneut auf; beschreibe das Bild kurz.',
        };
      }
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
          note: 'Bild erfolgreich erstellt und dem*der Nutzer*in angezeigt. Rufe generate_image NICHT erneut auf; kündige das Bild kurz an.',
        };
      }
      const err = result.error ?? 'Bildgenerierung fehlgeschlagen.';
      sse.send('image_complete', { message: PROGRESS_MESSAGES.imageError(err), error: err });
      return { error: err };
    },
  });
}

/**
 * `sharepic` (Phase 3n fat tool, compound turns only): wraps the complete
 * single-pass sharepic pipeline (`runSharepicGeneration` — loop-safe: it emits
 * `sharepic_complete` itself and never ends the turn) so "recherchiere X und
 * mach ein Sharepic" can compose search + generation in ONE loop. The catalog
 * key MUST stay `sharepic`: card rehydration and follow-up edits look up the
 * persisted `toolName === 'sharepic'` with `result.variants`
 * (threadMessageConversion / getLastSharepicVariant / sharepicEditService), so
 * returning `{ variants }` verbatim keeps all three consumers unchanged.
 */
export function makeCreateSharepicTool(ctx: {
  sse: SSEWriter;
  state: ChatGraphState;
  req: Request;
  threadId: string | null;
  /** The turn forbade new research — see `briefInstruction`. */
  researchBanned?: boolean;
}): Tool {
  const { sse, state, req, threadId } = ctx;
  return tool({
    description: `Erstellt ein Sharepic (gebrandete Social-Media-Grafik) aus einer Kernaussage.

NUTZE NUR WENN der*die Nutzer*in ausdrücklich ein Sharepic/Spruchbild/Zitatbild/einen Dreizeiler verlangt hat — NICHT bei "Grafik", "Kachel" oder "Bild". ${briefInstruction(ctx.researchBanned === true, 'die konkrete, belegte Kernaussage')}`,
    inputSchema: z.object({
      text: z
        .string()
        .min(1)
        .describe('Kernaussage/Thema des Sharepics — konkret, mit den recherchierten Fakten'),
    }),
    execute: async ({ text }) => {
      // Idempotent per turn (mirror of generate_image): variants are expensive
      // and the model can't see the rendered result, so it tends to re-call.
      if (state.sharepicVariants?.length) {
        return {
          ok: true,
          note: 'Es wurde in diesem Turn bereits ein Sharepic erstellt und angezeigt. Rufe das Tool NICHT erneut auf; kündige das Sharepic kurz an.',
        };
      }
      sse.send('image_start', { message: 'Erstelle Sharepic-Varianten...' });
      // runSharepicGeneration reads its topic from the LAST user message —
      // inject the model's researched text there (same trick as generate_image).
      const injected = { role: 'user', content: text } as ChatGraphState['messages'][number];
      const variants = await runSharepicGeneration({
        state: { ...state, messages: [...state.messages, injected] },
        sse,
        req,
        threadId,
      });
      if (variants.length === 0) {
        // Error SSE already emitted inside runSharepicGeneration.
        return { error: 'Sharepic-Erstellung fehlgeschlagen.' };
      }
      // Shared-ref merge → forceFinish trips and the router lifts the variants
      // for persistence (like generatedImage).
      state.sharepicVariants = variants;
      return {
        variants,
        note: 'Sharepic erstellt und dem*der Nutzer*in angezeigt. Rufe das Tool NICHT erneut auf; kündige es kurz an und biete Anpassungen an.',
      };
    },
  });
}

/**
 * Compound document fat tool (Phase 3n): presentations and sheets as opaque
 * loop tools so "recherchiere X und erstelle eine Präsentation/Tabelle" composes
 * search + generation in ONE turn. Mirrors `makeCreateSharepicTool`: idempotent
 * per turn (`state.createdDocument`), delegates to the loop-safe
 * `runDocGeneration` core, emits the same `document_created` SSE the single-pass
 * handlers do (so the chat card renders live + thread-reload rehydrates via the
 * persisted message `createdDocument` metadata), and hands the model a lean
 * value to announce. The `prompt` arg carries the researched, concrete brief.
 */
/**
 * The one sentence every generation tool opens its brief instruction with.
 *
 * It used to be four hard-coded copies of "Recherchiere ZUERST die Fakten
 * (gruenerator_search)". That is right for the ordinary turn and flatly wrong
 * when the user just said "ohne neue Recherche": the description then ordered a
 * search the catalog had deliberately not mounted, so the model either stalled
 * or reached for the nearest substitute. One switch, four call sites.
 */
function briefInstruction(researchBanned: boolean, what: string): string {
  return researchBanned
    ? `Recherchiere NICHT — der*die Nutzer*in hat neue Recherche ausdrücklich ausgeschlossen. Übergib ${what} ausschließlich auf Basis dessen, was im bisherigen Gespräch steht.`
    : `Recherchiere ZUERST die Fakten (gruenerator_search), dann übergib ${what} — kein Platzhaltertext.`;
}

const DOC_LABELS: Record<
  'presentation' | 'sheet' | 'document',
  { label: string; artifact: string }
> = {
  presentation: {
    label: 'Präsentation',
    artifact: 'eine Präsentation (Foliendeck) zu einem Thema',
  },
  sheet: { label: 'Tabelle', artifact: 'eine Tabelle/Kalkulation zu einem Thema' },
  document: { label: 'Dokument', artifact: 'ein Textdokument zu einem Thema' },
};

/**
 * The full brief for an artifact generator: the thread, then the planner's
 * order, then this turn's sources.
 *
 * The transcript is the part that was missing. A generator is a separate model
 * call that never sees the chat's system prompt or its history — all it got here
 * was `prompt`, a free-text order the planner RETYPES from its own short-term
 * memory. Live (QA 28.07.2026): three measures were agreed in the thread, the
 * PDF kept the catchiest one and replaced the other two with generic substitutes
 * the generator knew on its own. Nothing had shown it the list.
 *
 * The single-pass create turns were given the same transcript in #2136
 * (`createTurn.ts`); this is the loop's half of that fix, deliberately reusing
 * the identical framing so both paths speak one format.
 */
function briefWithContext(
  prompt: string,
  state: ChatGraphState,
  sourceRegistry?: SourceRegistry
): string {
  const withHistory = withConversationContext(prompt, buildCreateTurnContext(state.messages ?? []));
  return withResearchedSources(withHistory, sourceRegistry?.renderReference() ?? '');
}

export function makeCreateDocTool(ctx: {
  kind: 'presentation' | 'sheet' | 'document';
  sse: SSEWriter;
  state: ChatGraphState;
  req: Request;
  /** Sources gathered this turn. Appended to the brief so the artifact is built
   *  from the real snippets (incl. URLs) rather than from whatever the planner
   *  chose to retype into `prompt`. */
  sourceRegistry?: SourceRegistry;
  /** The turn forbade new research — see `briefInstruction`. */
  researchBanned?: boolean;
}): Tool {
  const { kind, sse, state, req, sourceRegistry } = ctx;
  const { label, artifact } = DOC_LABELS[kind];
  return tool({
    description: `Erstellt ${artifact}.

NUTZE WENN der*die Nutzer*in ${label === 'Präsentation' ? 'eine Präsentation/Folien' : label === 'Tabelle' ? 'eine Tabelle/Kalkulation' : 'ein Dokument/einen Text'} zum Thema möchte. ${briefInstruction(ctx.researchBanned === true, 'in "prompt" einen konkreten, mit den recherchierten Fakten angereicherten Auftrag')}`,
    inputSchema: z.object({
      prompt: z
        .string()
        .min(1)
        .describe(
          `Konkreter Auftrag für ${label === 'Dokument' ? 'das Dokument' : `die ${label}`} — Thema plus die recherchierten Fakten/Inhalte, die vorkommen sollen`
        ),
    }),
    execute: async ({ prompt }) => {
      // Idempotent per turn (mirror of sharepic/generate_image): generation is
      // expensive and the model can't see the rendered result, so it re-calls.
      if (state.createdDocument) {
        return {
          ok: true,
          note: `Es wurde in diesem Turn bereits ${label === 'Dokument' ? 'ein Dokument' : `eine ${label}`} erstellt und angezeigt. Rufe das Tool NICHT erneut auf; kündige es kurz an.`,
        };
      }
      const userId = state.agentConfig?.userId;
      if (!userId) {
        return { error: `${label}-Erstellung nicht möglich (keine Nutzer-Sitzung).` };
      }
      const created = await runDocGeneration({
        kind,
        userContent: briefWithContext(prompt, state, sourceRegistry),
        aiWorkerPool: state.aiWorkerPool,
        req,
        userId,
      });
      if (!created) {
        return { error: `${label}-Erstellung fehlgeschlagen.` };
      }
      // Live card (same event the single-pass handler emits). Shared-ref merge →
      // forceFinish trips and the router lifts it for message-level persistence.
      sse.send('document_created', created);
      state.createdDocument = created;
      return {
        document: created,
        note: `${label} erstellt und dem*der Nutzer*in angezeigt. Rufe das Tool NICHT erneut auf; kündige es kurz an.`,
      };
    },
  });
}

/**
 * Compound PDF fat tool. Same contract as makeCreateDocTool (idempotent via
 * `state.createdDocument`, `document_created` SSE, router lifts the metadata) —
 * but the result is a finished, downloadable CI-styled PDF (subtype 'pdf',
 * url = authenticated compute-asset download), not an editable document. Kept
 * as a sibling factory because of the extra letterhead/sender input fields.
 */
export function makeCreatePdfTool(ctx: {
  sse: SSEWriter;
  state: ChatGraphState;
  req: Request;
  /** See {@link makeCreateDocTool} — the brief is enriched with this turn's
   *  (and any carried) sources so "PDF mit den Originalquellen" can actually
   *  reproduce them. */
  sourceRegistry?: SourceRegistry;
  /** The turn forbade new research — see `briefInstruction`. */
  researchBanned?: boolean;
}): Tool {
  const { sse, state, req, sourceRegistry } = ctx;
  return tool({
    description: `Erstellt ein fertig gestaltetes PDF nach dem Barrierefreiheits-Standard PDF/UA-1 zum Herunterladen. Der*die Nutzer*in beschreibt frei, was drin stehen soll — Aufbau (Überschriften, Listen, Tabellen, Hinweiskästen, Datenblätter, Unterschriftszeilen) wählt das System passend zum Auftrag.

DREI ARTEN:
- "document": Merkblatt, Konzept, Übersicht, Protokoll, Handout — alles zum Lesen/Ausdrucken
- "letter": offizieller Brief / Anschreiben mit Grünen-Briefkopf (DIN 5008)
- "form": AUSFÜLLBARES Formular mit echten Feldern (Text, Datum, Auswahl, Ankreuzfelder) — für Anträge, Anmeldungen, Fragebögen

NUTZE WENN ein fertiges PDF, ein Schreiben mit Briefkopf oder ein ausfüllbares Formular gewünscht ist. ${briefInstruction(ctx.researchBanned === true, 'in "prompt" einen konkreten, mit den recherchierten Fakten angereicherten Auftrag')}

WICHTIG — PRÜFEN STATT BEHAUPTEN: Das Tool öffnet das erzeugte PDF erneut und prüft, ob Text wirklich auslesbar ist, die Struktur getaggt wurde, die PDF/UA-Kennung gesetzt ist und alle Formularfelder beschriftet sind. Häufiger Fehler bei PDFs: Sie sehen richtig aus, enthalten aber KEINE auslesbare Textebene oder keine Tags — dann kann sie kein Screenreader lesen. Lies deshalb IMMER das Feld "geprueft" und vor allem "probleme" im Ergebnis und nenne gefundene Probleme offen; behaupte NIE, das PDF sei barrierefrei, wenn "probleme" nicht leer ist.`,
    inputSchema: z.object({
      prompt: z
        .string()
        .min(1)
        .describe(
          'Konkreter Auftrag für das PDF — Thema, gewünschter Aufbau und die recherchierten Fakten/Inhalte, die vorkommen sollen. Bei einem Formular: welche Angaben abgefragt werden sollen.'
        ),
      art: z
        .enum(['dokument', 'brief', 'formular'])
        .optional()
        .describe(
          'Art des PDFs. "formular" nur bei einem AUSFÜLLBAREN Formular, "brief" bei einem Schreiben mit Briefkopf.'
        ),
      sender: z
        .object({
          name: z.string().optional().describe('Name der absendenden Person'),
          organization: z.string().optional().describe('Gliederung, z.B. "KV Musterstadt"'),
          address: z.string().optional().describe('Absender-Adresse (mehrzeilig)'),
        })
        .optional()
        .describe(
          'Absenderblock für den Briefkopf — nur wenn der*die Nutzer*in Angaben gemacht hat'
        ),
      recipient: z
        .string()
        .optional()
        .describe('Empfänger-Adressblock (mehrzeilig) — nur bei einem Brief'),
    }),
    execute: async ({ prompt, art, sender, recipient }) => {
      // Idempotent per turn (mirror of makeCreateDocTool).
      if (state.createdDocument) {
        return {
          ok: true,
          note: 'Es wurde in diesem Turn bereits ein PDF erstellt und angezeigt. Rufe das Tool NICHT erneut auf; kündige es kurz an.',
        };
      }
      const userId = state.agentConfig?.userId;
      if (!userId) {
        return { error: 'PDF-Erstellung nicht möglich (keine Nutzer-Sitzung).' };
      }
      const brief = briefWithContext(prompt, state, sourceRegistry);
      const userContent = recipient ? `${brief}\n\nEmpfänger des Schreibens:\n${recipient}` : brief;
      // Classify on the ASK, never on the enriched brief: a "Formular"/"Brief"
      // wording inside an appended source snippet would otherwise flip the layout.
      const documentKind =
        art === 'formular' ? 'form' : art === 'brief' ? 'letter' : pdfKindFromText(prompt);
      const result = await runPdfGeneration({
        userContent,
        aiWorkerPool: state.aiWorkerPool,
        req,
        userId,
        pdfOptions: {
          documentKind,
          sender: sender
            ? {
                name: sender.name ?? null,
                organization: sender.organization ?? null,
                address: sender.address ?? null,
              }
            : null,
          userLocale: state.userLocale === 'de-AT' ? 'de-AT' : 'de-DE',
        },
      });
      if (!result) {
        return { error: 'PDF-Erstellung fehlgeschlagen.' };
      }
      // Live card (same event the single-pass handler emits). Shared-ref merge →
      // forceFinish trips and the router lifts it for message-level persistence.
      sse.send('document_created', result.document);
      state.createdDocument = result.document;
      return {
        document: result.document,
        geprueft: result.summary,
        felder: result.verification.formFields,
        probleme: result.verification.problems,
        note: result.verification.problems.length
          ? 'PDF erstellt und als Download angezeigt. Die Selbstprüfung hat Probleme gefunden — nenne sie der*dem Nutzer*in offen. Rufe das Tool NICHT erneut auf.'
          : 'PDF erstellt, selbst geprüft und als Download angezeigt. Rufe das Tool NICHT erneut auf; kündige es kurz an.',
      };
    },
  });
}

/**
 * Compound board fat tool. Boards have a DIFFERENT contract than documents:
 * no `document_created`/card path — the board renders from `boardId` +
 * `boardGeneratedStructure` in the turn's `done` event. So this tool stashes the
 * descriptor on `state.createdBoard` (shared-ref → router lifts it into the loop
 * `done` event) and hands the model the board URL to mention. No card
 * rehydration on reload (matches the single-pass @board-erstellen path).
 */
export function makeCreateBoardTool(ctx: {
  state: ChatGraphState;
  req: Request;
  /** The turn forbade new research — see `briefInstruction`. */
  researchBanned?: boolean;
}): Tool {
  const { state, req } = ctx;
  return tool({
    description: `Erstellt ein Kanban-Board (Aufgabenboard) zu einem Thema.

NUTZE WENN der*die Nutzer*in ein Board/Kanban zum Thema möchte. ${briefInstruction(ctx.researchBanned === true, 'in "prompt" einen konkreten, mit den recherchierten Inhalten angereicherten Auftrag (Aufgaben/Spalten)')}`,
    inputSchema: z.object({
      prompt: z
        .string()
        .min(1)
        .describe('Konkreter Auftrag für das Board — Thema plus die Aufgaben/Inhalte'),
    }),
    execute: async ({ prompt }) => {
      if (state.createdBoard) {
        return {
          ok: true,
          note: 'Es wurde in diesem Turn bereits ein Board erstellt und angezeigt. Rufe das Tool NICHT erneut auf; kündige es kurz an.',
        };
      }
      const userId = state.agentConfig?.userId;
      if (!userId) {
        return { error: 'Board-Erstellung nicht möglich (keine Nutzer-Sitzung).' };
      }
      const created = await runBoardGeneration({
        userContent: briefWithContext(prompt, state),
        aiWorkerPool: state.aiWorkerPool,
        req,
        userId,
      });
      if (!created) {
        return { error: 'Board-Erstellung fehlgeschlagen.' };
      }
      // Shared-ref merge → forceFinish trips and the router lifts boardId +
      // structure into the `done` event (boards have no mid-stream card SSE).
      state.createdBoard = created;
      return {
        board: { boardId: created.boardId, title: created.title },
        note: `Board "${created.title}" erstellt (unter /boards/${created.boardId}). Rufe das Tool NICHT erneut auf; kündige es kurz an und nenne den Link.`,
      };
    },
  });
}
