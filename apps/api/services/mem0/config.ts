/**
 * Mem0 Configuration Builder
 *
 * Builds mem0 configuration using existing environment variables.
 * Reuses LiteLLM for LLM, existing MistralEmbeddingService for embeddings,
 * and the existing Qdrant client (with proper basic auth) for vector storage.
 */

import OpenAI from 'openai';

import { env } from '../../config/env.js';
import { createQdrantClient } from '../../database/services/QdrantService/connection.js';
import { extractJsonObject, extractLastJsonObject } from '../../utils/jsonParser.js';
import { createLogger } from '../../utils/logger.js';
import { REGOLO_BASE_URL } from '../ai/providers.js';
import { regoloFetchWithThinkingDisabled } from '../ai/regoloThinkingFetch.js';
import { MistralEmbeddingService } from '../mistral/MistralEmbeddingService/MistralEmbeddingService.js';

import { withRemovedSearchCompat } from './qdrantSearchCompat.js';

import type { MemoryConfig } from 'mem0ai/oss';

/**
 * Explizit gepinnt — folgt NICHT mehr `intermediateLane('heavy')`.
 *
 * Der Adapter unten baut seinen Client aus `REGOLO_BASE_URL` + `REGOLO_API_KEY`
 * und nahm bis 01.08.2026 nur den MODELLNAMEN aus der heavy-Stufe. Das hielt,
 * solange heavy auf Regolo lag, und wurde in dem Moment falsch, in dem die
 * Stufe nach Scaleway zog: mem0 hätte einen Scaleway-Modellnamen an Regolos
 * Basis-URL geschickt. Die Stufe hatte diese Falle selbst dokumentiert.
 *
 * Ein Konsument, der Host UND Schlüssel fest verdrahtet, kann einer Lane nicht
 * folgen — also folgt er ihr nicht mehr. Wer das Modell hier wechselt, wechselt
 * es bewusst und prüft die JSON-Extraktion (der defensive Parser unten existiert,
 * weil Reasoning-Modelle das JSON in Chain-of-Thought wickeln).
 *
 * ── 25.08.2026: warum das hier NICHT mit auf Cortecs gezogen ist ──
 *
 * Alle übrigen Gemma-Primäre liegen seit diesem Tag auf Cortecs
 * (services/ai/gemmaHosts.ts). Diese Stelle bleibt, und zwar aus demselben
 * Grund, aus dem sie 2026-08-01 aufhörte, einer Lane zu folgen: der Adapter
 * baut seinen Client aus `REGOLO_BASE_URL` + `REGOLO_API_KEY` +
 * `regoloFetchWithThinkingDisabled`. Ein Umzug ist deshalb ein
 * TRANSPORT-Wechsel (andere Basis-URL, anderer Schlüssel, und statt der
 * Denk-Abschaltung die Souveränitäts-Weisung aus cortecsRequestPolicy.ts),
 * nicht das Umhängen eines Modellnamens.
 *
 * Der Preis eines unbedachten Umzugs steht direkt darunter: scheitert die
 * JSON-Extraktion, liefert der Adapter still `{"facts": [], "memory": []}`.
 * Das Gedächtnis hörte dann auf zu arbeiten, ohne dass irgendwo ein Fehler
 * erscheint. Erst messen, dann ziehen.
 */
const LANE = { provider: 'regolo' as const, model: 'gemma4-31b' };

const log = createLogger('Mem0Config');

// Singleton embedding service instance
let embeddingServiceInstance: MistralEmbeddingService | null = null;

/**
 * Get or create the MistralEmbeddingService singleton.
 */
function getEmbeddingService(): MistralEmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new MistralEmbeddingService();
  }
  return embeddingServiceInstance;
}

/**
 * LangChain-compatible embeddings adapter.
 * Wraps MistralEmbeddingService to provide the interface mem0 expects.
 */
class MistralEmbeddingsAdapter {
  private service: MistralEmbeddingService;

  constructor() {
    this.service = getEmbeddingService();
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.service.generateEmbedding(text);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.service.generateBatchEmbeddings(texts, 'search_document');
  }
}

/**
 * LangChain-compatible LLM adapter for LiteLLM.
 * Handles JSON mode via prompting instead of response_format (which Ollama doesn't support properly).
 */
class LiteLLMAdapter {
  private client: OpenAI;
  public model: string;
  public modelId: string;

  constructor(baseURL: string, apiKey: string, model: string, fetchImpl?: typeof fetch) {
    this.client = new OpenAI({ baseURL, apiKey, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
    this.model = model;
    this.modelId = model;
  }

  /**
   * LangChain-compatible invoke method.
   * Handles JSON mode by adding system prompt instructions instead of response_format.
   */
  async invoke(
    messages: Array<{ role: string; content: string }>,
    options?: { response_format?: { type: string } }
  ): Promise<{ content: string }> {
    const wantsJson = options?.response_format?.type === 'json_object';

    // If JSON mode is requested, add instruction to system prompt
    let processedMessages = messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    if (wantsJson) {
      // Add JSON instruction to system message or create one
      const systemIdx = processedMessages.findIndex((m) => m.role === 'system');
      if (systemIdx >= 0) {
        processedMessages[systemIdx].content +=
          '\n\nIMPORTANT: You MUST respond with valid JSON only. No markdown, no explanations.';
      } else {
        processedMessages = [
          {
            role: 'system' as const,
            content: 'You MUST respond with valid JSON only. No markdown, no explanations.',
          },
          ...processedMessages,
        ];
      }
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: processedMessages,
      max_tokens: 4096,
    });

    const raw = response.choices[0]?.message?.content || '';

    // Defensive parse: reasoning models can still wrap JSON in chain-of-thought
    // (sometimes with literal `...` ellipsis tokens in arrays) despite thinking
    // being disabled. extractLastJsonObject tries all JSON blocks last-to-first
    // with ellipsis repair. Pass silent:true so parse failures don't emit ERROR
    // logs — mem0ai gets a safe fallback below.
    let parsed = extractJsonObject(raw, { silent: true });

    if (!parsed) {
      parsed = extractLastJsonObject(raw);
      if (parsed) {
        log.debug('[LiteLLMAdapter] Recovered JSON from last block in chain-of-thought response');
      }
    }

    // On total parse failure, return a neutral shape containing BOTH keys mem0ai looks for:
    //   facts: []  → mem0ai's fact-extraction path ends cleanly with zero memories
    //   memory: [] → mem0ai's memory-action path ends cleanly with zero actions
    // This prevents mem0ai's console.error dumps of the full raw LLM response.
    const content = parsed ? JSON.stringify(parsed) : '{"facts": [], "memory": []}';

    if (!parsed) {
      log.warn(
        `[LiteLLMAdapter] LLM returned non-JSON response (${raw.length} chars); using empty fallback`
      );
    }

    return { content };
  }
}

/**
 * Create a configured Qdrant client for mem0.
 * Uses the existing connection logic which properly handles basic auth via headers.
 *
 * Der Client geht durch `withRemovedSearchCompat()`, weil mem0s Qdrant-Store
 * noch `client.search()` ruft — seit `@qdrant/js-client-rest@1.19.0` entfernt.
 * Siehe `qdrantSearchCompat.ts` für die vollständige Begründung.
 */
function createMem0QdrantClient() {
  const url = env.QDRANT_URL || 'http://localhost:6333';
  const apiKey = env.QDRANT_API_KEY || '';
  const basicAuthUsername = env.QDRANT_BASIC_AUTH_USERNAME;
  const basicAuthPassword = env.QDRANT_BASIC_AUTH_PASSWORD;

  return withRemovedSearchCompat(
    createQdrantClient({
      url,
      apiKey,
      ...(basicAuthUsername ? { basicAuthUsername } : {}),
      ...(basicAuthPassword ? { basicAuthPassword } : {}),
      timeout: 60000,
    })
  );
}

/**
 * Build mem0 configuration from environment variables.
 *
 * Uses existing infrastructure:
 * - LiteLLM via custom LangChain adapter (handles JSON mode properly)
 * - MistralEmbeddingService (existing, battle-tested) for embeddings
 * - Existing Qdrant client (with proper basic auth handling)
 */
export function buildMem0Config(): Partial<MemoryConfig> {
  // Disable mem0ai's built-in PostHog telemetry to avoid HTTP/2 GOAWAY errors
  process.env.MEM0_TELEMETRY = 'false';

  // NOTE: this extraction LLM's output schema (mem0ai's AdditiveExtractionSchema)
  // has no category or confidence field per memory — asking it to "attach"
  // either as metadata here is silently dropped by schema validation. Category
  // and confidence are decided upstream by our own gatekeeper
  // (gatekeeperService.ts) before this ever runs, and applied as call-level
  // metadata in Mem0Service.addMemories(). This prompt's job is narrower:
  // extract sparsely within the categories the gatekeeper already approved,
  // and actively override mem0's own "when in doubt, extract" default (its
  // built-in prompt explicitly says a redundant memory is cheap — for us it
  // is not, see chat-memory-mem0-shape memory note on unbounded growth).
  //
  // The "Existing Memories" reference in the "Sparsam extrahieren" section below
  // is NOT dead like the confidence/category instruction was: mem0ai's
  // addToVectorStore() runs a vectorStore.search() for the 10 nearest neighbours
  // and injects them into the prompt under a real "## Existing Memories" heading
  // before ADDITIVE_EXTRACTION_PROMPT runs (see generateAdditiveExtractionPrompt
  // in node_modules/mem0ai/dist/oss/index.js). Verified against the installed
  // version, not assumed.
  const customInstructions = `Du bist ein Gedächtnis-Assistent für den Grünerator, eine KI-Plattform für Die Grünen.

Ein Gatekeeper hat diesen Austausch bereits geprüft und nur Kategorien mit ausreichender Konfidenz freigegeben. Deine Aufgabe ist NICHT, möglichst viel zu extrahieren — im Zweifel NICHT extrahieren.

## Kategorien (nur diese sind relevant)

1. **identity** — Persönliche Fakten: Name, Wahlkreis, Kreisverband, politische Funktion, Parteiebene, Fachgebiete
   Beispiel: "Kreisverbandsvorstand in Freiburg" → identity
2. **activity** — Zeitgebundene Ereignisse: laufende Anträge, Pressemitteilungen, Kampagnen, Parteitagstermine
   Beispiel: "Arbeitet am Klimaantrag für den Landesparteitag im Mai" → activity
3. **context** — Laufende Situationen: aktuelle Projekte, AG-Arbeit, Koalitionsverhandlungen
   Beispiel: "Ist Mitglied der AG Energie und Klimaschutz" → context
4. **experience** — Erfahrungen: was bei Formaten gut ankam, Lektionen aus Kampagnen
   Beispiel: "Letzte PM zum Bürgergeld kam in lokalen Medien gut an" → experience
5. **preference** — Dauerhafte Präferenzen: Schreibstil, Tonalität, Formate, Zielgruppe, Sprachlevel
   Beispiel: "Bevorzugt kurze, direkte Formulierungen für Social Media" → preference

## Sparsam extrahieren

- Wenn ein Fakt bereits (auch anders formuliert) unter "Existing Memories" steht: NICHT erneut extrahieren.
- Nur dauerhaft relevante Fakten, keine einmaligen Details, die in einer Woche nutzlos sind.
- Ein redundanter Eintrag ist für uns NICHT günstiger als ein fehlender — im Zweifel weglassen.

Speichere NICHT:
- Aufgaben-Anweisungen ("tweet kürzen", "schreibe eine Rede", "mach kürzer")
- Einmalige Generierungsaufträge oder Formatierungs-Befehle
- Gesprächs-Metadaten (Grüße, Danke, Feedback zum Tool)
- Sensible persönliche Daten (Adresse, Telefonnummer, Passwörter)

Antworte auf Deutsch. Formuliere Erinnerungen als kurze Fakten-Aussagen (max. 1-2 Sätze).`;

  return {
    customInstructions,

    // LLM for memory extraction and synthesis.
    // Regolo's mistral-small (the same model the gatekeeper uses via
    // the `heavy` stage) with thinking disabled — it returns clean JSON,
    // unlike gpt-oss:120b via Verdigado which emitted chain-of-thought preamble
    // and routinely failed the JSON parse, dropping all extracted memories.
    llm: {
      provider: 'langchain',
      config: {
        model: new LiteLLMAdapter(
          REGOLO_BASE_URL,
          env.REGOLO_API_KEY || '',
          LANE.model,
          regoloFetchWithThinkingDisabled
        ),
      },
    },

    // Embedder for semantic search
    // Uses LangChain adapter wrapping existing MistralEmbeddingService
    embedder: {
      provider: 'langchain',
      config: {
        model: new MistralEmbeddingsAdapter(),
        embeddingDims: 1024,
      },
    },

    // Vector store for memory persistence
    // Uses pre-configured Qdrant client with proper basic auth
    vectorStore: {
      provider: 'qdrant',
      config: {
        collectionName: 'user_memories',
        embeddingModelDims: 1024,
        client: createMem0QdrantClient(),
      },
    },

    // Disable internal history (we use our own PostgreSQL table)
    disableHistory: true,
  };
}

/**
 * Validate that required environment variables are set.
 * Returns an array of missing variable names.
 */
export function validateMem0Environment(): string[] {
  const missing: string[] = [];

  // Gate on the keys mem0 actually uses: Regolo for the extraction LLM
  // (buildMem0Config) and the gatekeeper (`heavy` stage → regolo),
  // Mistral for embeddings, and Qdrant for the vector store. LiteLLM is NOT
  // part of the mem0 stack, so requiring LITELLM_API_KEY here previously made
  // the feature report "available" while every extraction LLM call failed
  // (or report "unavailable" in envs that only have REGOLO_API_KEY).
  if (!env.REGOLO_API_KEY) missing.push('REGOLO_API_KEY');
  if (!env.MISTRAL_API_KEY) missing.push('MISTRAL_API_KEY');
  if (!env.QDRANT_URL) missing.push('QDRANT_URL');

  return missing;
}

/**
 * Check if mem0 can be enabled based on environment.
 */
export function isMem0Available(): boolean {
  return validateMem0Environment().length === 0;
}
