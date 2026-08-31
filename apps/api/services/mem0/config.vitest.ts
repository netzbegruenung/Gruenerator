/**
 * Wächter für die Extraktions-Tür von mem0.
 *
 * Der Punkt dieser Datei ist EIN Satz: die Extraktion holt ihr Modell aus der
 * Stufe `heavy` und baut sich keinen eigenen Transport. Genau das war bis zum
 * 31.08.2026 anders (fest verdrahtete Basis-URL + Schlüssel + Modellname), und
 * genau daran hing #3065 — als Regolos Konto mit HTTP 402 antwortete, war die
 * Extraktion aus, während Gatekeeper und Persona derselben Funktion auf ihrer
 * Kette weiterliefen.
 *
 * Der zweite Wächter gilt der Rolle: mem0ai reicht LangChain-Nachrichten herein,
 * die kein `role`-Feld tragen. Wer hier wieder `m.role` liest, schickt jede
 * Nachricht ohne Rolle hinaus — und der JSON-Zweig findet den System-Prompt
 * nicht mehr, den er ergänzen will.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Nur so viel von `generateText`s Optionen, wie diese Datei prüft — damit die
 *  Zusicherungen unten getypt sind statt über `any` zu laufen. */
interface GenerateTextCall {
  readonly model: unknown;
  readonly messages: readonly { readonly role: string; readonly content: string }[];
  readonly maxOutputTokens?: number;
}

const mockGenerateText = vi.fn<(options: GenerateTextCall) => Promise<{ text: string }>>();
vi.mock('ai', () => ({ generateText: mockGenerateText }));

const mockGetIntermediateModel = vi.fn(() => ({ id: 'mock-model' }));
const mockResolveIntermediateChain = vi.fn(() => [
  { provider: 'cortecs', model: 'gemma-4-31b-it' },
  { provider: 'regolo', model: 'gemma4-31b' },
]);
const mockIsProviderConfigured = vi.fn(() => true);
vi.mock('../ai/providers.js', () => ({
  getIntermediateModel: mockGetIntermediateModel,
  resolveIntermediateChain: mockResolveIntermediateChain,
  isProviderConfigured: mockIsProviderConfigured,
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../mistral/MistralEmbeddingService/MistralEmbeddingService.js', () => ({
  MistralEmbeddingService: class {},
}));

vi.mock('../../database/services/QdrantService/connection.js', () => ({
  createQdrantClient: () => ({}),
}));

vi.mock('./qdrantSearchCompat.js', () => ({ withRemovedSearchCompat: (c: unknown) => c }));

const mockEnv: Record<string, string | undefined> = {
  MISTRAL_API_KEY: 'm',
  QDRANT_URL: 'http://localhost:6333',
};
vi.mock('../../config/env.js', () => ({
  env: new Proxy({}, { get: (_t, k) => mockEnv[k as string] }),
}));

const { buildMem0Config, validateMem0Environment } = await import('./config.js');

/** Die Gestalt, die mem0ai wirklich hereinreicht: LangChain-Nachrichten, kein
 *  `role`-Feld, die Sorte steckt in `_getType()`. */
function langchainMessage(kind: 'system' | 'human' | 'ai', content: string) {
  return { content, _getType: () => kind };
}

function extractionLlm() {
  const llm = buildMem0Config().llm;
  // Discriminated-union-Zugriff ohne Destrukturierung (CLAUDE.md).
  if (!llm || llm.provider !== 'langchain') throw new Error('expected the langchain provider');
  return llm.config.model as unknown as {
    modelId: string;
    invoke(
      messages: ReturnType<typeof langchainMessage>[],
      options?: { response_format?: { type: string } }
    ): Promise<{ content: string }>;
  };
}

describe('mem0 extraction LLM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue({ text: '{"facts": ["a"]}' });
    mockIsProviderConfigured.mockReturnValue(true);
  });

  it('takes its model from the `heavy` lane instead of building a transport', async () => {
    await extractionLlm().invoke([langchainMessage('human', 'hallo')]);

    expect(mockGetIntermediateModel).toHaveBeenCalledWith('heavy');
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(mockGenerateText.mock.calls[0]?.[0].model).toEqual({ id: 'mock-model' });
  });

  it('resolves the lane per call, not once at construction', async () => {
    const llm = extractionLlm();
    await llm.invoke([langchainMessage('human', 'eins')]);
    await llm.invoke([langchainMessage('human', 'zwei')]);

    expect(mockGetIntermediateModel).toHaveBeenCalledTimes(2);
  });

  it('reads the role from `_getType()`, which is where LangChain keeps it', async () => {
    await extractionLlm().invoke([
      langchainMessage('system', 'du bist ein Gedächtnis'),
      langchainMessage('human', 'ich wohne in Freiburg'),
      langchainMessage('ai', 'notiert'),
    ]);

    expect(mockGenerateText.mock.calls[0]?.[0].messages).toEqual([
      { role: 'system', content: 'du bist ein Gedächtnis' },
      { role: 'user', content: 'ich wohne in Freiburg' },
      { role: 'assistant', content: 'notiert' },
    ]);
  });

  it('appends the JSON rule to the existing system prompt rather than prepending a second one', async () => {
    await extractionLlm().invoke(
      [langchainMessage('system', 'ORIGINAL'), langchainMessage('human', 'x')],
      {
        response_format: { type: 'json_object' },
      }
    );

    const sent = mockGenerateText.mock.calls[0]?.[0].messages ?? [];
    expect(sent.filter((m) => m.role === 'system')).toHaveLength(1);
    expect(sent[0]?.content).toContain('ORIGINAL');
    expect(sent[0]?.content).toContain('valid JSON only');
  });

  it('still recovers JSON wrapped in chain-of-thought', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'Ich überlege kurz…\n{"facts": ["wohnt in Freiburg"]}',
    });

    const result = await extractionLlm().invoke([langchainMessage('human', 'x')]);

    expect(JSON.parse(result.content)).toEqual({ facts: ['wohnt in Freiburg'] });
  });

  it('falls back to the neutral shape when nothing parses, without throwing', async () => {
    mockGenerateText.mockResolvedValue({ text: 'überhaupt kein JSON' });

    const result = await extractionLlm().invoke([langchainMessage('human', 'x')]);

    expect(JSON.parse(result.content)).toEqual({ facts: [], memory: [] });
  });
});

describe('validateMem0Environment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsProviderConfigured.mockReturnValue(true);
    mockEnv.MISTRAL_API_KEY = 'm';
    mockEnv.QDRANT_URL = 'http://localhost:6333';
  });

  it('does not name a single provider key any more — the lane carries a chain', () => {
    expect(validateMem0Environment()).toEqual([]);
    expect(validateMem0Environment().join(',')).not.toContain('REGOLO_API_KEY');
  });

  it('reports missing when no provider in the `heavy` chain is configured', () => {
    mockIsProviderConfigured.mockReturnValue(false);

    const missing = validateMem0Environment();

    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('cortecs/regolo');
  });

  it('still requires the embedding and vector-store settings', () => {
    mockEnv.MISTRAL_API_KEY = undefined;
    mockEnv.QDRANT_URL = undefined;

    expect(validateMem0Environment()).toEqual(['MISTRAL_API_KEY', 'QDRANT_URL']);
  });
});
