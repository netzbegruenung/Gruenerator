import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../stores/chatConfigStore';

import { getAvailableClientTools, getClientToolExecutor } from './clientTools';

afterEach(() => {
  useChatConfigStore.setState({ renderSharepicSheet: undefined });
});

describe('render_sharepic', () => {
  it('ist nur verfügbar, wenn der Host das Rendern der Karte eingehängt hat', () => {
    expect(getAvailableClientTools()).not.toContain('render_sharepic');
    expect(getClientToolExecutor('render_sharepic')).toBeNull();

    useChatConfigStore.setState({ renderSharepicSheet: async () => 'data:image/png;base64,AA' });

    expect(getAvailableClientTools()).toContain('render_sharepic');
    expect(getClientToolExecutor('render_sharepic')).not.toBeNull();
  });

  it('rendert die initialProps und liefert das Bild', async () => {
    const render = vi.fn(async () => 'data:image/jpeg;base64,BB');
    useChatConfigStore.setState({ renderSharepicSheet: render });

    const result = await getClientToolExecutor('render_sharepic')!({
      variantId: 'v1',
      canvasType: 'freeform',
      initialProps: { creatorSpec: {} },
    });

    expect(render).toHaveBeenCalledWith({ creatorSpec: {} });
    expect(result).toEqual({ image: 'data:image/jpeg;base64,BB' });
  });

  it('ein Renderfehler oder fehlende Props ergeben kein Bild statt einer Ausnahme', async () => {
    useChatConfigStore.setState({
      renderSharepicSheet: async () => {
        throw new Error('Konva kaputt');
      },
    });
    const execute = getClientToolExecutor('render_sharepic')!;

    expect(await execute({ initialProps: {} })).toEqual({ image: null });
    expect(await execute({})).toEqual({ image: null });
  });
});
