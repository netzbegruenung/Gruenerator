import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { McpToolUI } from './McpToolUI';

describe('McpToolUI', () => {
  it('shows a spinner and is not expandable while the call is pending', () => {
    render(<McpToolUI args={{ server: 'notion', tool: 'search' }} />);
    expect(screen.getByText('notion')).toBeInTheDocument();
    expect(screen.getByText('search')).toBeInTheDocument();
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-expanded');
  });

  it('becomes expandable once done, toggling aria-expanded and revealing args/result', async () => {
    const user = userEvent.setup();
    render(
      <McpToolUI
        args={{ server: 'notion', tool: 'search', query: 'Klimaschutz' }}
        result={{ ok: true, pages: 3 }}
      />
    );
    const button = screen.getByRole('button');
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Anfrage')).not.toBeInTheDocument();

    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Anfrage')).toBeInTheDocument();
    expect(screen.getByText(/Klimaschutz/)).toBeInTheDocument();
    expect(screen.getByText('Ergebnis')).toBeInTheDocument();
    expect(screen.getByText(/"pages": 3/)).toBeInTheDocument();
  });

  it('omits the "Anfrage" section when the call has no extra args beyond server/tool', async () => {
    const user = userEvent.setup();
    render(<McpToolUI args={{ server: 'notion', tool: 'search' }} result="done" />);
    await user.click(screen.getByRole('button'));
    expect(screen.queryByText('Anfrage')).not.toBeInTheDocument();
    expect(screen.getByText('Ergebnis')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();
  });

  it('shows an error icon when result.ok is false', () => {
    render(<McpToolUI args={{ server: 'notion' }} result={{ ok: false }} />);
    expect(screen.getByRole('button')).toBeEnabled();
  });
});
