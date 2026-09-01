/**
 * Mem0 Configuration Builder
 *
 * Builds mem0 configuration from existing infrastructure: the `heavy`
 * intermediate lane for the extraction LLM, the existing MistralEmbeddingService
 * for embeddings, and the existing Qdrant client (with proper basic auth) for
 * vector storage.
 */

import { generateText } from 'ai';

import { env } from '../../config/env.js';
import { createQdrantClient } from '../../database/services/QdrantService/connection.js';
import { extractJsonObject, extractLastJsonObject } from '../../utils/jsonParser.js';
import { createLogger } from '../../utils/logger.js';
import {
  getIntermediateModel,
  isProviderConfigured,
  resolveIntermediateChain,
} from '../ai/providers.js';
import { MistralEmbeddingService } from '../mistral/MistralEmbeddingService/MistralEmbeddingService.js';

import { withRemovedSearchCompat } from './qdrantSearchCompat.js';

import type { ModelMessage } from 'ai';
import type { MemoryConfig } from 'mem0ai/oss';

/**
 * Die Extraktion nimmt das MODELL der Stufe `heavy` — nicht bloss dessen Namen.
 *
 * Bis zum 31.08.2026 stand hier ein von Hand gebauter Transport: `REGOLO_BASE_URL`
 * + `REGOLO_API_KEY` + `regoloFetchWithThinkingDisabled` + der Modellname
 * `gemma4-31b`. Der Grund dafür war gut und ist trotzdem nicht mehr der richtige.
 *
 * ── Die Falle, die den Pin erzwang, und warum sie jetzt zu ist ──
 *
 * Am 01.08.2026 hörte diese Stelle auf, `intermediateLane('heavy')` zu folgen,
 * weil sie nur den MODELLNAMEN aus der Stufe nahm: zog die Stufe den Host um,
 * ging ein fremder Modellname an Regolos Basis-URL — ein 404. Der Schluss daraus
 * war der Pin. Der andere Schluss ist dieser hier: nicht den NAMEN nehmen,
 * sondern das aufgelöste MODELL. `getModel()` baut Basis-URL, Schlüssel und den
 * Host-eigenen `fetch`-Wrapper GEMEINSAM (services/ai/providerInstances.ts, die
 * eine Konstruktionsstelle). Ein Name kann sich von seinem Transport lösen, ein
 * Modellobjekt nicht — die Falle ist damit bauartbedingt weg, nicht umgangen.
 *
 * ── Was der Pin gekostet hat ──
 *
 * Wer Host UND Schlüssel fest verdrahtet, hängt an EINEM Vertragspartner. Am
 * 29.08.2026 antwortete Regolos Konto auf jedes Modell mit HTTP 402
 * (`trial_expired`), und die Extraktion war für die Dauer des Ausfalls
 * vollständig aus — während der Gatekeeper (`gatekeeperService.ts`) und die
 * Persona (`personaService.ts`) DERSELBEN Funktion auf `heavy` weiterliefen.
 * Ein Feature, zwei Hosts, einer davon tot (#3065).
 *
 * `getIntermediateModel('heavy')` liefert seit #3061 eine Kette über DREI
 * Vertragspartner (cortecs → regolo → mistral, siehe `intermediateLanes.ts`).
 * Ein Konto-402 ist damit ein Weiterrücken statt eines Ausfalls.
 *
 * ── Was der Umzug MITBRINGT, statt es zu verlieren ──
 *
 *  - Die Denk-Abschaltung für Regolo hängt am SDK-Client
 *    (`providerInstances.ts:122`), dieses Glied behält sie also. Cortecs'
 *    `gemma-4-31b-it` steht bewusst NICHT in `REASONING_OFF_MODELS`
 *    (`cortecsRequestPolicy.ts`): es denkt von sich aus nicht und weist
 *    `reasoning_effort: 'none'` mit HTTP 400 ab.
 *  - Die Souveränitäts-Weisung (`eu_native`, `allowed_providers`, die
 *    Nachprüfung über `x-cortecs-provider`) kommt mit `cortecsFetchWithPolicy`
 *    von selbst — genau das, was der alte Kommentar hier von einem Umzug
 *    verlangte.
 *
 * Der defensive Parser unten BLEIBT. Er ist der Grund, warum die Extraktion ein
 * Modell überlebt, das sein JSON in Chain-of-Thought wickelt, und über drei
 * Hosts ist er billiger als die Wette, dass keiner davon es je tut. Wenn auch er
 * nichts findet, wirft er — leise scheitern darf diese Stelle nicht, siehe den
 * Kommentar an ihm selbst.
 *
 * Ein Hostwechsel passiert ab hier in `gemmaHosts.ts` bzw. `intermediateLanes.ts`.
 * In dieser Datei ist dafür nichts mehr zu tun.
 */

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
 * Was `invoke()` hereinbekommt.
 *
 * mem0ai reicht LangChain-Nachrichten durch (`SystemMessage`/`HumanMessage`/
 * `AIMessage`, siehe `convertToLangchainMessages` in mem0ai/dist/oss), und die
 * tragen KEIN `role`-Feld — die Sorte steht in `_getType()`. Bis zum 31.08.2026
 * las diese Datei `m.role` und bekam überall `undefined`: jede Nachricht ging
 * ohne Rolle hinaus, und der JSON-Zweig unten fand nie den System-Prompt, den er
 * ergänzen wollte, sondern stellte ihm einen zweiten voran. Das AI SDK ist an
 * dieser Stelle strenger als der rohe OpenAI-Client — `ModelMessage` verlangt
 * eine Rolle —, deshalb fällt es beim Umbau auf.
 *
 * `role` bleibt trotzdem gelesen: `generateChat()` in mem0ai ruft dieselbe
 * Methode, und ein einfaches Objekt soll nicht daran scheitern.
 */
interface IncomingMessage {
  readonly content: unknown;
  readonly role?: string;
  readonly _getType?: () => string;
}

function roleOf(message: IncomingMessage): 'system' | 'user' | 'assistant' {
  const kind = typeof message._getType === 'function' ? message._getType() : message.role;
  if (kind === 'system') return 'system';
  if (kind === 'ai' || kind === 'assistant') return 'assistant';
  return 'user';
}

/** Kein `as`-Cast: die Rolle ist erst hier eng genug, um `ModelMessage` zu
 *  treffen, und ein Cast würde genau die Verengung überspringen. */
function toModelMessage(role: 'system' | 'user' | 'assistant', content: string): ModelMessage {
  if (role === 'system') return { role: 'system', content };
  if (role === 'assistant') return { role: 'assistant', content };
  return { role: 'user', content };
}

/**
 * Das LLM, das mem0ai für Extraktion und Synthese ruft — in der Gestalt, die
 * sein `langchain`-Provider erwartet (`invoke`, `modelId`).
 *
 * JSON-Modus per Prompt statt `response_format`: hinter `heavy` stehen drei
 * Hosts, und der Modus ist nicht auf allen gleich verlässlich. Die Anweisung im
 * System-Prompt ist die kleinste Fassung, die überall gilt.
 */
class Mem0ExtractionLlm {
  /** Nur ein Name: mem0ai liest ihn fürs Protokoll
   *  (`this.llmInstance.modelId || … || 'langchain-model'`). Welches Modell
   *  wirklich antwortet, entscheidet die Kette pro Aufruf. */
  public model = 'intermediate:heavy';
  public modelId = 'intermediate:heavy';

  async invoke(
    messages: IncomingMessage[],
    options?: { response_format?: { type: string } }
  ): Promise<{ content: string }> {
    const wantsJson = options?.response_format?.type === 'json_object';

    let processedMessages = messages.map((m) => ({
      role: roleOf(m),
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
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

    // Das Modell PRO AUFRUF holen, nicht im Konstruktor: `getIntermediateModel`
    // lässt unkonfigurierte Anbieter heraus und schiebt als zäh vermerkte ans
    // Ende der Kette. Eingefroren im Konstruktor wäre das die Lage beim Start
    // des Prozesses, nicht die beim Aufruf.
    const result = await generateText({
      model: getIntermediateModel('heavy'),
      messages: processedMessages.map((m) => toModelMessage(m.role, m.content)),
      maxOutputTokens: 4096,
    });

    const raw = result.text;

    // Defensive parse: reasoning models can still wrap JSON in chain-of-thought
    // (sometimes with literal `...` ellipsis tokens in arrays) despite thinking
    // being disabled. extractLastJsonObject tries all JSON blocks last-to-first
    // with ellipsis repair. Pass silent:true so parse failures don't emit ERROR
    // logs — a total failure leaves this method as a throw below.
    let parsed = extractJsonObject(raw, { silent: true });

    if (!parsed) {
      parsed = extractLastJsonObject(raw);
      if (parsed) {
        log.debug('[Mem0Extraction] Recovered JSON from last block in chain-of-thought response');
      }
    }

    // Kein lesbares JSON heißt AUSFALL, nicht „leeres Ergebnis“ — und der
    // Unterschied ist NUR hier bekannt. Bis zum 31.08.2026 ging an dieser Stelle
    // eine neutrale Gestalt zurück (`{"facts": [], "memory": []}`): mem0ai lief
    // damit sauber durch, `Mem0Service` sah null Erinnerungen und zählte
    // `recordMem0Success('add')`. Ein dauerhaft unlesbares Modell meldete sich
    // damit über `mem0Health` als gesund (#3073). Nach der Rückgabe lässt sich
    // „die Person hat nichts Merkenswertes gesagt“ nicht mehr von „das Modell
    // hat Unsinn geliefert“ trennen, also verlässt der Befund diese Stelle als
    // Wurf und nicht als Wert.
    //
    // Was die neutrale Gestalt eigentlich verhindern sollte, bleibt gedeckt:
    // mem0ai protokolliert den gefangenen Fehler (`console.error("LLM extraction
    // failed:", e)`), nicht die rohe Antwort — die steht hier nur als Länge.
    if (!parsed) {
      throw new SyntaxError(
        `[Mem0Extraction] LLM returned non-JSON response (${raw.length} chars)`
      );
    }

    return { content: JSON.stringify(parsed) };
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

    // LLM für Extraktion und Synthese: die Stufe `heavy` samt ihrer
    // Ausweichkette — dieselbe, auf der auch Gatekeeper und Persona laufen.
    // WELCHES Modell das ist, steht in `intermediateLanes.ts`, nicht hier;
    // siehe den Kopf dieser Datei, warum das keine Zeile mehr kostet.
    llm: {
      provider: 'langchain',
      config: {
        model: new Mem0ExtractionLlm(),
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

  // Gate on what mem0 actually uses. Der LLM-Teil nennt keinen Anbieter mehr
  // beim Namen: Extraktion, Gatekeeper und Persona haengen alle an der Stufe
  // `heavy`, und die fuehrt eine Kette. Hier stand bis zum 31.08.2026
  // `REGOLO_API_KEY` — nach dem Umzug wäre das weder nötig (ein Konto mit
  // Cortecs-Schlüssel meldete das Feature fälschlich als nicht verfuegbar)
  // noch hinreichend (ein Regolo-Schlüssel allein sagt nichts über den
  // Primär). Gefragt wird deshalb die Kette selbst.
  const heavyChain = resolveIntermediateChain('heavy');
  if (!heavyChain.some((target) => isProviderConfigured(target.provider))) {
    missing.push(`API key for one of: ${heavyChain.map((t) => t.provider).join('/')} (heavy lane)`);
  }
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
