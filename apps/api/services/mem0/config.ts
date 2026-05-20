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
import { MistralEmbeddingService } from '../mistral/MistralEmbeddingService/MistralEmbeddingService.js';

import type { MemoryConfig } from 'mem0ai/oss';

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

  constructor(baseURL: string, apiKey: string, model: string) {
    this.client = new OpenAI({ baseURL, apiKey });
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

    // GPT-OSS often outputs chain-of-thought reasoning before JSON,
    // sometimes with literal `...` ellipsis tokens in arrays.
    // extractLastJsonObject tries all JSON blocks last-to-first with ellipsis repair.
    // Pass silent:true so parse failures don't emit ERROR logs — failure is expected
    // for this model; mem0ai gets a safe fallback below.
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
 */
function createMem0QdrantClient() {
  const url = env.QDRANT_URL || 'http://localhost:6333';
  const apiKey = env.QDRANT_API_KEY || '';
  const basicAuthUsername = env.QDRANT_BASIC_AUTH_USERNAME;
  const basicAuthPassword = env.QDRANT_BASIC_AUTH_PASSWORD;

  return createQdrantClient({
    url,
    apiKey,
    ...(basicAuthUsername ? { basicAuthUsername } : {}),
    ...(basicAuthPassword ? { basicAuthPassword } : {}),
    timeout: 60000,
  });
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

  const litellmBaseUrl = env.LITELLM_BASE_URL || 'https://litellm.netzbegruenung.verdigado.net';
  const litellmApiKey = env.LITELLM_API_KEY || '';

  const customInstructions = `Du bist ein Gedächtnis-Assistent für den Grünerator, eine KI-Plattform für Die Grünen.

Extrahiere Erinnerungen und ordne sie einer der folgenden Kategorien zu:

## Kategorien

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

## Konfidenz

Bewerte jede Erinnerung:
- **high**: Explizite Aussage ("Ich bin...", "Ich bevorzuge immer...")
- **medium**: Aus Gesprächsmuster abgeleitet
- **low**: Einmalige Erwähnung, mehrdeutig

Speichere NICHT:
- Aufgaben-Anweisungen ("tweet kürzen", "schreibe eine Rede", "mach kürzer")
- Einmalige Generierungsaufträge oder Formatierungs-Befehle
- Gesprächs-Metadaten (Grüße, Danke, Feedback zum Tool)
- Sensible persönliche Daten (Adresse, Telefonnummer, Passwörter)

Antworte auf Deutsch. Formuliere Erinnerungen als kurze Fakten-Aussagen.
Füge bei jeder Erinnerung die Kategorie und Konfidenz als Metadaten hinzu.`;

  return {
    customInstructions,

    // LLM for memory extraction and synthesis
    // Uses LangChain adapter that handles JSON mode via prompting
    llm: {
      provider: 'langchain',
      config: {
        model: new LiteLLMAdapter(`${litellmBaseUrl}/v1`, litellmApiKey, 'gpt-oss:120b'),
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

  if (!env.LITELLM_API_KEY) missing.push('LITELLM_API_KEY');
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
