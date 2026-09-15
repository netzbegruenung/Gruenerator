/**
 * The audio half of the compute card (a `vertonen` result).
 *
 * Two properties are worth holding: the recording is NOT fetched until someone
 * asks for it — a reopened thread would otherwise pull every file it ever
 * produced — and the card does not call an audio file a calculation.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useChatConfigStore } from '../../stores/chatConfigStore';

import { ComputeCard } from './ComputeCard';

import type { ComputeData } from '../../hooks/useChatGraphStream';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) });
  useChatConfigStore.setState({ fetch: fetchMock } as never);
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
  globalThis.URL.revokeObjectURL = vi.fn();
});

const audioData: ComputeData = {
  operation: 'Text vertont',
  entries: [{ label: 'Länge', value: '1:23 Minuten' }],
  summary: 'Die Audiodatei liegt in der Mediathek.',
  fileAssets: [{ name: 'ansage.mp3', url: '/api/share/tok-1/download' }],
};

describe('ComputeCard with an audio asset', () => {
  it('does not load the recording before someone asks for it', () => {
    render(<ComputeCard data={audioData} />);

    expect(screen.getByRole('button', { name: /ansage\.mp3 anhören/ })).toBeInTheDocument();
    expect(document.querySelector('audio')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches through the configured fetch and plays', async () => {
    const user = userEvent.setup();
    render(<ComputeCard data={audioData} />);

    await user.click(screen.getByRole('button', { name: /ansage\.mp3 anhören/ }));

    await waitFor(() => expect(document.querySelector('audio')).not.toBeNull());
    // A bare <audio src> carries no Bearer — desktop would get a 401.
    expect(fetchMock).toHaveBeenCalledWith('/api/share/tok-1/download', { method: 'GET' });
    expect(document.querySelector('audio')).toHaveAttribute('src', 'blob:fake');
  });

  it('says so when the recording is gone instead of showing a dead player', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<ComputeCard data={audioData} />);

    await user.click(screen.getByRole('button', { name: /ansage\.mp3 anhören/ }));

    expect(await screen.findByText(/nicht mehr verfügbar/)).toBeInTheDocument();
  });

  it('calls an audio result audio, not a calculation', () => {
    render(<ComputeCard data={audioData} />);

    expect(screen.getByRole('group', { name: 'Text vertont' })).toBeInTheDocument();
    expect(screen.getByText('Audio')).toBeInTheDocument();
  });

  it('renders a recording once, not also as a plain download chip', () => {
    render(<ComputeCard data={audioData} />);

    // The play control names the file. A second, bare chip with the same name
    // is the duplicate: the generic chip loop used to include audio too.
    expect(screen.getByRole('button', { name: /ansage\.mp3 anhören/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ansage.mp3' })).toBeNull();
  });

  it('offers the recording as a download without playing it first', () => {
    render(<ComputeCard data={audioData} />);

    // Excluding audio from the chip row removed the only way to save it, so
    // the player block carries its own.
    expect(screen.getByRole('button', { name: 'ansage.mp3 herunterladen' })).toBeInTheDocument();
  });

  it('still chips a file that is not a recording', () => {
    render(
      <ComputeCard
        data={{
          ...audioData,
          fileAssets: [
            { name: 'ansage.mp3', url: '/api/share/tok-1/download' },
            { name: 'bericht.pdf', url: '/api/share/tok-2/download' },
          ],
        }}
      />
    );

    expect(screen.getByRole('button', { name: 'bericht.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ansage.mp3' })).toBeNull();
  });

  it('leaves a real calculation labelled as one', () => {
    render(
      <ComputeCard
        data={{
          operation: 'Zeichen zählen',
          entries: [{ label: 'Zeichen', value: '512' }],
          summary: '512 Zeichen.',
        }}
      />
    );

    expect(screen.getByRole('group', { name: 'Berechnung: Zeichen zählen' })).toBeInTheDocument();
    expect(screen.getByText('berechnet')).toBeInTheDocument();
  });
});
