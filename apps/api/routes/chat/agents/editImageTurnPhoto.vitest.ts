import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const imageEditNode = vi.fn();
vi.mock('../../../agents/langgraph/ChatGraph/nodes/imageEditNode.js', () => ({
  imageEditNode: (...a: unknown[]) => imageEditNode(...a),
}));
const loadLast = vi.fn();
vi.mock('../services/lastGeneratedImage.js', () => ({
  loadLastGeneratedImage: (...a: unknown[]) => loadLast(...a),
}));

import { turnImagesOf } from '../services/turnImages.js';

import { makeEditImageTool } from './domainTools.js';

type Exec = (input: unknown, options: unknown) => Promise<Record<string, unknown>>;
const execOf = (t: unknown) => (t as { execute: Exec }).execute;

const wolke = [{ shareLinkId: 's', path: '/IMG_2601.jpg', name: 'IMG_2601.jpg' }];
const result = { base64: 'data:image/jpeg;base64,ZZZ', url: '/x.jpg', filename: 'x.jpg' };

function setup(over: { download?: ReturnType<typeof vi.fn>; lastImageDefault?: boolean } = {}) {
  const download =
    over.download ??
    vi.fn(async () => ({
      ok: true as const,
      buffer: Buffer.from('ABC'),
      mimeType: 'image/jpeg',
      size: 3,
    }));
  const state = {
    messages: [{ role: 'user', content: 'erstelle ein bild von mir wo ich auf einer wolke surfe' }],
    imageAttachments: [],
    wolkeFiles: wolke,
    agentConfig: { userId: 'u1' },
  } as unknown as ChatGraphState;
  const sent: string[] = [];
  const tool = makeEditImageTool({
    sse: { send: (t: string) => void sent.push(t) } as never,
    state,
    threadId: 't1',
    turnImages: turnImagesOf(state, download as never),
    lastImageDefault: over.lastImageDefault ?? true,
  });
  return { tool, state, download, sent };
}

describe('edit_image mit bild', () => {
  beforeEach(() => {
    imageEditNode.mockReset().mockResolvedValue({ generatedImage: result });
    loadLast.mockReset().mockResolvedValue({ name: 'alt.jpg', type: 'image/jpeg', data: 'OLD' });
  });

  it('gibt dem imageEditNode das Wolke-Foto als Vorlage', async () => {
    const { tool, download } = setup();
    const out = await execOf(tool)({ anweisung: 'Ich surfe auf einer Wolke', bild: 1 }, {});
    expect(out.ok).toBe(true);
    expect(download).toHaveBeenCalledTimes(1);
    expect(loadLast).not.toHaveBeenCalled();
    const arg = imageEditNode.mock.calls[0]![0] as ChatGraphState;
    expect(arg.imageAttachments).toEqual([
      { name: 'IMG_2601.jpg', type: 'image/jpeg', data: 'QUJD' },
    ]);
  });

  it('bearbeitet ohne bild weiter das zuletzt erzeugte Bild', async () => {
    const { tool, download } = setup();
    await execOf(tool)({ anweisung: 'dunkler' }, {});
    expect(download).not.toHaveBeenCalled();
    const arg = imageEditNode.mock.calls[0]![0] as ChatGraphState;
    expect(arg.imageAttachments).toEqual([{ name: 'alt.jpg', type: 'image/jpeg', data: 'OLD' }]);
  });

  it('nimmt ohne bild nie still ein anderes Bild, wenn Turn-Fotos da sind', async () => {
    const { tool } = setup({ lastImageDefault: false });
    const out = await execOf(tool)({ anweisung: 'dunkler' }, {});
    expect(out.error).toContain('bild');
    expect(loadLast).not.toHaveBeenCalled();
    expect(imageEditNode).not.toHaveBeenCalled();
  });

  it('meldet einen fehlgeschlagenen Download ehrlich und erzeugt nichts', async () => {
    const { tool } = setup({
      download: vi.fn(async () => ({ ok: false as const, message: 'Freigabe fehlt' })),
    });
    const out = await execOf(tool)({ anweisung: 'x', bild: 1 }, {});
    expect(out.error).toContain('Freigabe fehlt');
    expect(imageEditNode).not.toHaveBeenCalled();
  });

  it('lehnt eine Nummer ohne Bild ab', async () => {
    const { tool } = setup();
    const out = await execOf(tool)({ anweisung: 'x', bild: 4 }, {});
    expect(out.error).toContain('kein Bild 4');
  });
});
