import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

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
});
