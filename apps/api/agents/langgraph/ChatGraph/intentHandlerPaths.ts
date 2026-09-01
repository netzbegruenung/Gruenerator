/**
 * Wo jedes Verdikt im Chat-Stack tatsächlich ausgeführt wird — eine Zeile pro
 * Intent.
 *
 * Reine Beschreibung, kein Verhalten: nichts liest die Strings zur Laufzeit.
 * Der Wert liegt im `Record<SearchIntent, string>` selbst — ein neuer Intent
 * bricht hier den Build, bis jemand sagt, welcher Zweig ihn bedient. Genau das
 * ist der Fehler, den ein Intent ohne Ausführungsweg erzeugt: kein Typfehler,
 * kein Absturz, sondern eine generische Antwort auf einen Auftrag, der einen
 * eigenen Weg gehabt hätte.
 *
 * Die Karte stand bis dahin IN `intentPipeline.vitest.ts` — und dort war der
 * `Record`-Typ Dekoration: `apps/api/tsconfig.json` schliesst `**\/*.vitest.ts`
 * aus, der Compiler sah die Datei nie. Geprüft hat allein eine Laufzeitschleife
 * über `searchIntentSchema.options`, die `undefined` meldet. Dieselbe Falle,
 * die `dispositions.ts` in ihrem Kopfkommentar beschreibt; derselbe Ausweg.
 *
 * Bewusst hier und nicht im Intent-Registry (`@gruenerator/shared/chat-intents`):
 * das Registry beschreibt, was ein Intent IST — plattformübergreifend, im
 * Web-Bundle und in jeder Mobile-Binary. Dies hier beschreibt, wo genau dieser
 * Server ihn ausführt, und ändert sich mit jedem Umbau des Routers.
 */

import type { SearchIntent } from './types.js';

export const INTENT_HANDLER_PATHS: Record<SearchIntent, string> = {
  image: 'handled via image branch in controller',
  image_edit: 'handled via image_edit branch in controller',
  sharepic: 'handled via sharepic branch in controller (image generation variant)',
  social_post:
    'STILLGELEGT (08/2026) — nichts erzeugt dieses Verdikt mehr; ein Social-Post ist eine Textsorte und wird vom Rezept geschrieben (respondNode bzw. rezept_laden). Die Karten alter Threads werden weiter gelesen und über socialPostEditService bearbeitet.',
  produktion:
    'falls through to response generation — the substance is already in the message (pasted material, an attachment, an open document, existing text to rework, or pure wordcraft). May inherit the thread’s earlier sources via carryThreadSourcesIfNeeded',
  direct:
    'DEPRECATED as a verdict — still reachable through the heuristic hint and persisted metadata.intent; treated exactly like produktion everywhere it is read',
  greeting:
    'falls through to response generation like direct, but never carries thread sources, never cites and never enters the agentic loop — decided by GREETING_PREFIX_PATTERN before any LLM runs',
  research: 'handled via search branch (intent !== direct)',
  compare: 'handled via search branch — multi-document comparison, same path as research',
  search: 'handled via search branch (intent !== direct)',
  web: 'handled via search branch (intent !== direct)',
  examples: 'handled via search branch (intent !== direct)',
  pressemitteilung_examples:
    'RETIRED as a verdict (availability: retired) — the landesverbaende press-release templates live on as the loop tool gruenerator_pressemitteilung_examples. @pressemitteilungen/@pm pins that TOOL (IntentMention.pinsTool) and loads the presse recipe (IntentMention.activatesSkill), running the turn as `agentic`. The searchNode arm that pushed the `press` kind is gone with it',
  abgeordnetenwatch:
    'handled via search branch (intent !== direct) — searchNode case calls EnrichedPoliticianService (Abgeordnetenwatch API)',
  bundestag:
    'handled via search branch (intent !== direct) — searchNode case calls BundestagEnrichedService (Bundestag MCP / DIP)',
  bahn: 'RETIRED as a verdict (availability: retired) — the Deutsche-Bahn tools live on as a managed connector, mounted by loadManagedMcpCatalog when the router’s vocabulary trigger names it. No tier produces this intent any more, so nothing here is reachable',
  reise:
    'RETIRED as a verdict — was the umbrella that mounted bahn + hotel + wetter together. The vocabulary trigger names each connector directly now, so the umbrella has nothing left to bundle',
  hotel:
    'RETIRED as a verdict — the trivago hotel-search tools are a managed connector, reached through the vocabulary trigger rather than through an intent',
  umfragen:
    'RETIRED as a verdict (availability: retired) — the PolitPro Sonntagsfrage/Meinungsbild tool lives on in the loop, mounted broadly by toolCatalog. @umfragen now pins that TOOL (IntentMention.pinsTool) and runs the turn as `agentic`, so no tier produces this intent any more',
  hilfe:
    'native domain tool — forces the agentic loop (isMcpTurn in router, so an @doku-forced turn still enters it); toolCatalog mounts makeDocsSearchTool (in-process BM25 over the generated docs index) and respondNode injects the docs page map; router degrades a killed loop turn to web',
  wetter:
    'RETIRED as a verdict — the Open-Meteo/DWD tools are a managed connector, reached through the vocabulary trigger rather than through an intent',
  news: 'RETIRED as a verdict — the ARD/tagesschau tools are a managed connector (citations via sourceRegistry), reached through the vocabulary trigger rather than through an intent',
  summary: 'handled via summary branch in controller',
  chart: 'routes to respond, chart data handled by controller post-response',
  artifact: 'routes to respond, controller extracts HTML/SVG block into an artifact SSE event',
  compute:
    'handled via compute branch in controller — computeNode runs plain-JS calc, emits compute SSE + injects verified result into respond',
  scrape_url: 'handled via search branch — crawls pasted URL(s) as additional context',
  save_as_doc: 'routes to respond, then confirm_action SSE + pendingActionStore',
  create_sheet:
    'handled via handleSheetCreation — generates a spreadsheet, seeds the Y.Doc, emits document_created SSE (subtype sheets); owns the turn on failure (templated error, never falls through)',
  edit_sheet:
    'handled via handleSheetEdit — Tier 2.7 follow-up on a chat-created sheet; plans typed ops (generateSheetOperations), emits editor_operations SSE; owns the turn always (templated text, no fall-through)',
  create_presentation:
    'handled via handlePresentationCreation — generates a reveal.js deck, seeds the Y.Doc, emits document_created SSE (subtype presentations); owns the turn on failure (templated error, never falls through)',
  create_pdf:
    'handled via handlePdfCreation — generates a tagged, CI-styled PDF (document/letter/form), verifies the finished bytes, stores it as a compute asset and emits document_created SSE (subtype pdf); owns the turn on failure (templated error, never falls through)',
  create_recurring_task:
    'RETIRED as a verdict (09/2026) — a recurring order is classified `agentic` with `mentionPinnedTool: recurring_tasks`; the loop tool fills the schedule and creates via confirm card',
  modify_doc: 'routes to respond, then confirm_action SSE + pendingActionStore',
  edit_current_doc:
    'routes to respond, controller emits trigger_doc_edit SSE for BlockNote AI live edit',
  edit_current_board:
    'controller emits trigger_board_action SSE for the boards assistant live edit (client-side executor)',
  modify_board: 'routes to respond, then confirm_action SSE + pendingActionStore',
  share_doc: 'short-circuits before LLM — resolves group, emits confirm_action SSE',
  mcp: "EXPERIMENTAL — always runs the agentic loop (streamAgenticResponse); mcpCatalog mounts the user's connected MCP tools into the same loop",
  chat_history:
    'handled via chat_history branch in executeIntentPipeline — recall tool-loop over the own threads (flag-gated), else recallContext injection',
  agentic:
    'loop demotion (classifier Tier 3.5) — router routes to streamAgenticResponse; never reaches executeIntentPipeline (safety line degrades a killed loop turn to search)',
};
