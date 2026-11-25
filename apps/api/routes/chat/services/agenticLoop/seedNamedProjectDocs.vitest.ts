import { describe, expect, it, vi } from 'vitest';

/**
 * #5952: nennt die Nachricht eine Projekt-Datei beim Titel, liest der Turn sie
 * vorab ganz — gemessen riefen die Modelle `read_artifact` sonst kaum und
 * rieten aus den Suchauszügen.
 */
const readArtifactContent = vi.fn();
vi.mock('../artifactReader.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../artifactReader.js')>()),
  readArtifactContent: (...a: unknown[]) => readArtifactContent(...a),
}));

const { seedNamedProjectDocs } = await import('./catalogAssembly.js');
const { createSourceRegistry } = await import('./sourceRegistry.js');

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';

function state(text: string, project = true): ChatGraphState {
  return {
    agentConfig: { userId: 'u1' },
    messages: [{ role: 'user', content: text }],
    lastUserTextNoMentions: text,
    project: project ? { id: 'g1', documentIds: ['f6'] } : null,
    projectDocs: [
      { id: 'f6', title: '06_protokoll_buergerbus.md', kind: 'file' },
      { id: 'd1', title: 'Haushaltsklausur 2027', kind: 'doc' },
    ],
  } as unknown as ChatGraphState;
}

const run = (s: ChatGraphState, isMounted = true) =>
  seedNamedProjectDocs({
    state: s,
    sourceRegistry: createSourceRegistry(),
    isMounted,
    onInfo: () => {},
    onError: () => {},
  });

describe('seedNamedProjectDocs', () => {
  it('liest eine beim Namen genannte Datei ganz und spielt sie als read_artifact ein', async () => {
    readArtifactContent.mockResolvedValueOnce('# Bürgerbus\n\nLetzter Satz.');
    const out = await run(state('Nenne den letzten Satz von 06_protokoll_buergerbus.md'));

    expect(readArtifactContent).toHaveBeenCalledWith({ id: 'f6', kind: 'file', userId: 'u1' });
    expect(out.delivered).toBe(true);
    expect(out.replay).toHaveLength(2);
    const result = out.replay[1]!.content as unknown as Array<{
      toolName: string;
      output: { value: { content: string; truncated: boolean } };
    }>;
    expect(result[0]!.toolName).toBe('read_artifact');
    expect(result[0]!.output.value.content).toContain('Letzter Satz.');
    expect(result[0]!.output.value.truncated).toBe(false);
  });

  it('sagt bei einer langen Datei, wo es weitergeht', async () => {
    readArtifactContent.mockResolvedValueOnce('x'.repeat(20_000));
    const out = await run(state('Fasse die Haushaltsklausur 2027 zusammen'));
    const value = (
      out.replay[1]!.content as unknown as Array<{ output: { value: Record<string, unknown> } }>
    )[0]!.output.value;
    expect(value.truncated).toBe(true);
    expect(value.weiter).toEqual({ ab: 12_000 });
  });

  it('nichts ohne Projekt, ohne genannten Titel oder wenn der Leser wirft', async () => {
    readArtifactContent.mockReset();
    expect((await run(state('06_protokoll_buergerbus.md', false))).delivered).toBe(false);
    expect((await run(state('Wie war das mit dem Bus?'))).delivered).toBe(false);
    expect(readArtifactContent).not.toHaveBeenCalled();
    readArtifactContent.mockRejectedValueOnce(new Error('wird eingelesen'));
    const out = await run(state('Lies 06_protokoll_buergerbus.md'));
    expect(out).toEqual({ replay: [], delivered: false });
  });

  it('ohne montiertes read_artifact: Quelle ja, Replay nein', async () => {
    readArtifactContent.mockResolvedValueOnce('Text');
    const out = await run(state('Lies 06_protokoll_buergerbus.md'), false);
    expect(out).toEqual({ replay: [], delivered: true });
  });
});
