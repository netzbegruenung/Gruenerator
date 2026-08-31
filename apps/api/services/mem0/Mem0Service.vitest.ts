/**
 * Wächter für die Buchführung von `addMemories`.
 *
 * `mem0Health` speist den unauthentifizierten `/health`-Endpunkt und kennt nur
 * zwei Ausgänge, ok und failed — es gibt keine Nachricht, in der man später
 * nachlesen könnte, was wirklich passiert ist. Umso mehr hängt daran, dass die
 * Zählung stimmt: null Erinnerungen ist der HÄUFIGE, gesunde Ausgang (der
 * Gatekeeper überspringt mehr, als er extrahiert), ein unlesbares
 * Extraktionsmodell ist ein Ausfall — und bis zum 31.08.2026 sahen beide von
 * hier aus gleich aus (#3073).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAdd = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('mem0ai/oss', () => ({
  Memory: class {
    add = mockAdd;
  },
}));

const mockRecordSuccess = vi.fn();
const mockRecordFailure = vi.fn();
vi.mock('./mem0Health.js', () => ({
  recordMem0Success: mockRecordSuccess,
  recordMem0Failure: mockRecordFailure,
}));

vi.mock('./config.js', () => ({
  buildMem0Config: () => ({}),
  isMem0Available: () => true,
  validateMem0Environment: () => [],
}));

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn() }),
}));

const logged = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
vi.mock('../../utils/logger.js', () => ({ createLogger: () => logged }));

const { Mem0Service } = await import('./Mem0Service.js');

/** Die Gestalt, in der ein Wurf aus dem Extraktions-LLM wirklich ankommt:
 *  mem0ai fängt ihn in `addToVectorStore` und verpackt ihn. */
function wrappedByMem0(cause: Error): Error {
  const wrapped = new Error(`LLM extraction failed: ${cause.message}`, { cause });
  wrapped.name = 'LLMError';
  return wrapped;
}

const messages = [{ role: 'user' as const, content: 'Ich sitze im KV Freiburg' }];

describe('Mem0Service.addMemories — was als Erfolg zählt', () => {
  beforeEach(() => vi.clearAllMocks());

  it('zählt einen Parse-Ausfall des Extraktionsmodells als Ausfall, nicht als Erfolg', async () => {
    mockAdd.mockRejectedValue(
      wrappedByMem0(new SyntaxError('[Mem0Extraction] LLM returned non-JSON response (812 chars)'))
    );

    const result = await new Mem0Service().addMemories(messages, 'user-1');

    expect(result).toEqual([]);
    expect(mockRecordFailure).toHaveBeenCalledWith('add');
    expect(mockRecordSuccess).not.toHaveBeenCalled();
    // leise: ein schlecht formatierendes Modell ist keine Stoerung derselben
    // Lautstaerke wie ein Host, der gar nicht antwortet.
    expect(logged.warn).toHaveBeenCalled();
    expect(logged.error).not.toHaveBeenCalled();
  });

  it('zählt „nichts Merkenswertes" weiterhin als Erfolg', async () => {
    mockAdd.mockResolvedValue({ results: [] });

    const result = await new Mem0Service().addMemories(messages, 'user-1');

    expect(result).toEqual([]);
    expect(mockRecordSuccess).toHaveBeenCalledWith('add');
    expect(mockRecordFailure).not.toHaveBeenCalled();
  });

  it('lässt einen Transportausfall im lauten Zweig — auch er ist verpackt', async () => {
    // Regolos HTTP 402 aus #3065 trägt unter demselben `LLMError` einen anderen
    // Fehler. Er darf nicht in den leisen Parse-Zweig rutschen.
    const transport = new Error('402 trial_expired');
    transport.name = 'APICallError';
    mockAdd.mockRejectedValue(wrappedByMem0(transport));

    const result = await new Mem0Service().addMemories(messages, 'user-1');

    expect(result).toEqual([]);
    expect(mockRecordFailure).toHaveBeenCalledWith('add');
    expect(mockRecordSuccess).not.toHaveBeenCalled();
    expect(logged.error).toHaveBeenCalled();
  });
});
