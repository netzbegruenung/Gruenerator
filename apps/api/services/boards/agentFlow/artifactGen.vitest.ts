/**
 * `generateTaskList` is the board agent's own model call — the one that does not
 * einen Client an jemanden weiterreichen — and the first production caller of the
 * typed facade. What is worth pinning is the request it makes (routed lane, JSON
 * mode, the sampling the old envelope set) and that a provider failure still
 * degrades to an empty list rather than killing the queued task.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const aiText = vi.fn();

vi.mock('../../ai/generate.js', () => ({ aiText: (...args: unknown[]) => aiText(...args) }));
// Pulled in for `runDocGeneration`, which this path
// touches — mocked so the module graph stays cheap.
vi.mock('../../../routes/chat/services/intentExecutionService.js', () => ({
  runDocGeneration: vi.fn(),
}));

const { generateTaskList } = await import('./artifactGen.js');

const TASKS = JSON.stringify({
  tasks: [{ title: 'Termin festlegen', description: 'Mit dem Vorstand abstimmen' }],
});

beforeEach(() => {
  vi.clearAllMocks();
  aiText.mockResolvedValue(TASKS);
});

describe('generateTaskList', () => {
  it('parses the model answer into tasks', async () => {
    await expect(generateTaskList('Plane die Kampagne')).resolves.toEqual([
      { title: 'Termin festlegen', description: 'Mit dem Vorstand abstimmen', dueDate: null },
    ]);
  });

  it('asks the doc_generation lane in JSON mode', async () => {
    await generateTaskList('Plane die Kampagne');

    expect(aiText).toHaveBeenCalledWith(
      expect.objectContaining({
        lane: 'doc_generation',
        prompt: 'Plane die Kampagne',
        json: true,
        temperature: 0.3,
        maxOutputTokens: 2000,
      })
    );
  });

  it('degrades to an empty list when the provider chain fails', async () => {
    // The caller queues cards from the result; a throw here would fail an
    // already-accepted board task.
    aiText.mockRejectedValue(new Error('No provider produced an answer'));

    await expect(generateTaskList('Plane die Kampagne')).resolves.toEqual([]);
  });

  it('degrades to an empty list when the answer is not a task list', async () => {
    aiText.mockResolvedValue('Gerne! Hier sind ein paar Ideen …');

    await expect(generateTaskList('Plane die Kampagne')).resolves.toEqual([]);
  });
});
