import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { LoadingOverlay } from './LoadingOverlay';

const FLYER_STEPS = ['extract', 'analyze', 'write', 'images'] as const;

describe('LoadingOverlay', () => {
  it('lists the steps in order with the current one marked', () => {
    render(<LoadingOverlay isLoading message="Flyer" steps={FLYER_STEPS} current="write" />);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Text wird aus dem Flyer gelesen');
    expect(items[1]).toHaveTextContent('Flyer wird ausgewertet');
    expect(items[2]).toHaveTextContent('Texte werden geschrieben');
    expect(items[3]).toHaveTextContent('Bilder werden ausgesucht');
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).toHaveTextContent('erledigt');
    expect(items[1]).toHaveTextContent('erledigt');
    expect(items[2]).not.toHaveTextContent('erledigt');
  });

  it('counts the running step as half done', () => {
    const { rerender } = render(
      <LoadingOverlay isLoading message="m" steps={['write', 'images']} current="write" />
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    rerender(<LoadingOverlay isLoading message="m" steps={['write', 'images']} current="images" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
    rerender(<LoadingOverlay isLoading message="m" steps={['write', 'images']} current={null} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('announces the current step in a status region', () => {
    render(<LoadingOverlay isLoading message="m" steps={FLYER_STEPS} current="analyze" />);
    expect(screen.getByRole('status')).toHaveTextContent('Flyer wird ausgewertet');
  });

  it('calls onCancel', async () => {
    const onCancel = vi.fn();
    render(
      <LoadingOverlay
        isLoading
        message="m"
        steps={FLYER_STEPS}
        current="write"
        onCancel={onCancel}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('moves focus inside on open, cancels on Escape and returns focus on close', async () => {
    const onCancel = vi.fn();
    const Host = ({ loading }: { loading: boolean }) => (
      <>
        <button type="button">Generieren</button>
        <LoadingOverlay
          isLoading={loading}
          message="m"
          steps={FLYER_STEPS}
          current="write"
          onCancel={onCancel}
        />
      </>
    );
    const { rerender } = render(<Host loading={false} />);
    const trigger = screen.getByRole('button', { name: 'Generieren' });
    trigger.focus();
    rerender(<Host loading />);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    rerender(<Host loading={false} />);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('renders nothing when not loading', () => {
    const { container } = render(
      <LoadingOverlay isLoading={false} message="m" steps={[]} current={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <LoadingOverlay
        isLoading
        message="m"
        steps={FLYER_STEPS}
        current="write"
        onCancel={() => {}}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
