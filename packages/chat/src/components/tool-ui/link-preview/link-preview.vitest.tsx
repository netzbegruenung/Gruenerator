import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LinkPreview } from './link-preview';

import type { SerializableLinkPreview } from './schema';

function preview(over: Partial<SerializableLinkPreview> = {}): SerializableLinkPreview {
  return {
    id: 'lp-1',
    href: 'https://example.org/article',
    title: 'Ein Artikel',
    description: 'Eine Beschreibung',
    domain: 'example.org',
    ...over,
  };
}

describe('LinkPreview', () => {
  it('renders title, description and domain', () => {
    render(<LinkPreview {...preview()} />);
    expect(screen.getByText('Ein Artikel')).toBeInTheDocument();
    expect(screen.getByText('Eine Beschreibung')).toBeInTheDocument();
    expect(screen.getByText('example.org')).toBeInTheDocument();
  });

  it('calls onNavigate with the sanitized href on click when a handler is given', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<LinkPreview {...preview()} onNavigate={onNavigate} />);
    await user.click(screen.getByRole('link'));
    expect(onNavigate).toHaveBeenCalledWith(
      'https://example.org/article',
      expect.objectContaining({ href: 'https://example.org/article' })
    );
  });

  it('rejects a javascript: href — renders no clickable link role', () => {
    // sanitizeHref only allows http(s)/relative URLs; this pins the XSS guard's UI effect.
    render(<LinkPreview {...preview({ href: 'javascript:alert(1)' })} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('omits the domain row entirely when no domain is provided', () => {
    render(<LinkPreview {...preview({ domain: undefined })} />);
    expect(screen.queryByText('example.org')).not.toBeInTheDocument();
  });
});
