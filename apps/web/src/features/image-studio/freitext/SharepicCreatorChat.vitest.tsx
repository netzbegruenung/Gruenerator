import { useAui } from '@assistant-ui/react';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';

import { SharepicCreatorChat } from './SharepicCreatorChat';
import { PHOTO_PART_NAME } from './sharepicPhotoAttachments';

import type { CreatorPhoto } from './sharepicPhotos';

// The real thread is a large UI; what is under test is the runtime wiring around it:
// a message with attachments → onNew → photosOf → onSend / onPhotoError.
vi.mock('@gruenerator/chat', async () => {
  function Thread() {
    const aui = useAui();
    const send = (text: string, outcome: unknown) =>
      aui.thread().append({
        role: 'user',
        content: [{ type: 'text', text }],
        attachments: [
          {
            id: 'a1',
            type: 'image',
            name: 'stand.jpg',
            contentType: 'image/jpeg',
            content: [{ type: 'data', name: PHOTO_PART_NAME, data: outcome }],
            status: { type: 'complete' },
          },
        ],
      });
    return (
      <>
        <button onClick={() => send('', { photo })}>mit Foto</button>
        <button onClick={() => send('ok', { photo })}>kurz mit Foto</button>
        <button onClick={() => send('Sharepic', { error: 'Upload kaputt' })}>defektes Foto</button>
      </>
    );
  }
  return { GrueneratorThread: Thread };
});

const photo: CreatorPhoto = {
  name: 'stand.jpg',
  url: '/api/share/0123456789abcdef0123456789abcdef/download',
  analysis: {
    motiv: 'Infostand',
    personen: 2,
    ruhigeSeite: 'oben',
    hell: true,
    eignung: 'vollflaeche',
    stichworte: [],
    analysiert: true,
  },
};

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});
afterEach(() => server.resetHandlers());

describe('SharepicCreatorChat wiring', () => {
  it('hands an attached photo to onSend even without text', async () => {
    const onSend = vi.fn();
    render(
      <SharepicCreatorChat messages={[]} phase="idle" onSend={onSend} onPhotoError={vi.fn()} />
    );
    await userEvent.click(screen.getByText('mit Foto'));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('', [photo]));
  });

  it('hands short text and photo together', async () => {
    const onSend = vi.fn();
    render(
      <SharepicCreatorChat messages={[]} phase="idle" onSend={onSend} onPhotoError={vi.fn()} />
    );
    await userEvent.click(screen.getByText('kurz mit Foto'));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('ok', [photo]));
  });

  it('reports a failed photo and still sends the text', async () => {
    const onSend = vi.fn();
    const onPhotoError = vi.fn();
    render(
      <SharepicCreatorChat messages={[]} phase="idle" onSend={onSend} onPhotoError={onPhotoError} />
    );
    await userEvent.click(screen.getByText('defektes Foto'));
    await waitFor(() => expect(onPhotoError).toHaveBeenCalledWith('Upload kaputt'));
    expect(onSend).toHaveBeenCalledWith('Sharepic', []);
  });
});
