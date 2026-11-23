import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../../stores/chatConfigStore';

import { GeneratedImageDisplay } from './GeneratedImageDisplay';

import type { GeneratedImage } from '../../hooks/useChatGraphStream';

const image: GeneratedImage = {
  base64: '',
  url: 'https://example.org/a.png',
  filename: 'a.png',
  prompt: 'Straßenbahn',
  style: 'realistic',
  generationTimeMs: 1,
};

describe('GeneratedImageDisplay', () => {
  it('renders the zoom overlay on document.body, outside the message subtree', async () => {
    const { container } = render(<GeneratedImageDisplay image={image} />);

    await userEvent.click(screen.getAllByRole('img')[0]);

    const dialog = await screen.findByRole('dialog', { name: 'Bild vergrößert' });
    expect(dialog.parentElement).toBe(document.body);
    expect(container).not.toContainElement(dialog);
  });

  describe('Im Editor öffnen', () => {
    afterEach(() => useChatConfigStore.setState({ onEditImage: undefined }));

    it('hands a KI-Bild to the host editor', async () => {
      const onEditImage = vi.fn();
      useChatConfigStore.setState({ onEditImage });
      render(<GeneratedImageDisplay image={image} />);

      await userEvent.click(screen.getByRole('button', { name: 'Im Editor öffnen' }));

      expect(onEditImage).toHaveBeenCalledWith({
        src: 'https://example.org/a.png',
        title: 'Straßenbahn',
      });
    });

    it('is not offered without a host editor or for a sharepic', () => {
      const { rerender } = render(<GeneratedImageDisplay image={image} />);
      expect(screen.queryByRole('button', { name: 'Im Editor öffnen' })).toBeNull();

      useChatConfigStore.setState({ onEditImage: vi.fn() });
      rerender(<GeneratedImageDisplay image={{ ...image, style: 'sharepic' }} />);
      expect(screen.queryByRole('button', { name: 'Im Editor öffnen' })).toBeNull();
    });
  });
});
