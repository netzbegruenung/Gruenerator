/**
 * Mem0 Configuration Builder
 *
 * Builds mem0 configuration using existing environment variables.
 * Reuses LiteLLM for LLM, existing MistralEmbeddingService for embeddings,
 * and the existing Qdrant client (with proper basic auth) for vector storage.
 */

import OpenAI from 'openai';

import { createQdrantClient } from '../../database/services/QdrantService/connection.js';
import { MistralEmbeddingService } from '../mistral/MistralEmbeddingService/MistralEmbeddingService.js';

import type { MemoryConfig } from 'mem0ai/oss';

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

    let content = response.choices[0]?.message?.content || '';

    // GPT-OSS often outputs chain-of-thought reasoning before JSON.
    // Try each { or [ as a potential JSON start, with end-trimming fallback.
    if (wantsJson && content) {
      const bracketRe = /[[{]/g;
      let match: RegExpExecArray | null;
      let extracted = false;
      while (!extracted && (match = bracketRe.exec(content)) !== null) {
        if (match.index === 0) continue; // already valid JSON at position 0
        const candidate = content.slice(match.index);
        try {
          JSON.parse(candidate);
          content = candidate;
          extracted = true;
        } catch {
          for (let end = candidate.length - 1; end > 0; end--) {
            const ch = candidate[end];
            if (ch === '}' || ch === ']') {
              try {
                JSON.parse(candidate.slice(0, end + 1));
                content = candidate.slice(0, end + 1);
                extracted = true;
                break;
              } catch {
                /* continue scanning */
              }
            }
          }
        }
      }
    }

    return { content };
  }
}

/**
 * Create a configured Qdrant client for mem0.
 * Uses the existing connection logic which properly handles basic auth via headers.
 */
function createMem0QdrantClient() {
  const url = process.env.QDRANT_URL || 'http://localhost:6333';
  const apiKey = process.env.QDRANT_API_KEY || '';
  const basicAuthUsername = process.env.QDRANT_BASIC_AUTH_USERNAME;
  const basicAuthPassword = process.env.QDRANT_BASIC_AUTH_PASSWORD;

  return createQdrantClient({
    url,
    apiKey,
    basicAuthUsername,
    basicAuthPassword,
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
  const litellmBaseUrl =
    process.env.LITELLM_BASE_URL || 'https://litellm.netzbegruenung.verdigado.net';
  const litellmApiKey = process.env.LITELLM_API_KEY || '';

  const customPrompt = `Du bist ein Gedächtnis-Assistent für den Grünerator, eine KI-Plattform für Die Grünen.

Speichere NUR folgende Informationen:
1. Persönliche Fakten: Name, Wahlkreis, Kreisverband, politische Funktion, Parteiebene
2. Politische Positionen: Themen, Schwerpunkte, Haltungen zu Sachfragen
3. Schreibstil-Präferenzen: bevorzugte Tonalität, Sprachlevel, Zielgruppe
4. Wiederkehrende Kontexte: regelmäßige Formate (Pressemitteilung, Social Media, Rede), häufige Themen

Speichere NICHT:
- Aufgaben-Anweisungen wie "tweet kürzen", "schreibe eine Rede", "mach kürzer", "übersetze"
- Einmalige Generierungsaufträge oder Formatierungs-Befehle
- Gesprächs-Metadaten (Grüße, Danke, Feedback zum Tool)
- Sensible persönliche Daten (Adresse, Telefonnummer, Passwörter)

Antworte auf Deutsch. Formuliere Erinnerungen als kurze Fakten-Aussagen.`;

  return {
    customPrompt,

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

  if (!process.env.LITELLM_API_KEY) missing.push('LITELLM_API_KEY');
  if (!process.env.MISTRAL_API_KEY) missing.push('MISTRAL_API_KEY');
  if (!process.env.QDRANT_URL) missing.push('QDRANT_URL');

  return missing;
}

/**
 * Check if mem0 can be enabled based on environment.
 */
export function isMem0Available(): boolean {
  return validateMem0Environment().length === 0;
}
