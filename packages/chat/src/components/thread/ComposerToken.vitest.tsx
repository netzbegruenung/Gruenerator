import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SiNotion } from 'react-icons/si';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import { ComposerToken } from './ComposerToken';

/**
 * The chip sets `aria-hidden` and `aria-label` by hand, which is what
 * `docs/CLAUDE-a11y.md` names as the trigger for an axe block. Both call shapes
 * are covered: the pinned connector (icon component + brand colour) and an
 * @-mention (emoji glyph), which were separate copies of this markup until they
 * were merged.
 */
describe('ComposerToken', () => {
  it('has no axe violations as a connector chip', async () => {
    const { container } = render(
      <ComposerToken
        icon={SiNotion}
        brandColor="#0F0F0F"
        label="Notion"
        removeLabel="Notion lösen"
        onRemove={() => {}}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations as a mention chip with an emoji glyph', async () => {
    const { container } = render(
      <ComposerToken
        glyph="🔎"
        label="Websuche"
        removeLabel="Websuche entfernen"
        onRemove={() => {}}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('names the remove button after the token so it is not a bare "×"', async () => {
    const onRemove = vi.fn();
    render(
      <ComposerToken
        icon={SiNotion}
        label="Notion"
        removeLabel="Notion lösen"
        onRemove={onRemove}
      />
    );

    const button = screen.getByRole('button', { name: 'Notion lösen' });
    await userEvent.click(button);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('keeps decoration out of the accessible name', () => {
    // The label is the only thing a screen reader should read: the mark and the
    // glyph are `aria-hidden`, and the × carries its own label. Without that the
    // chip announces the emoji and the vendor mark's title alongside the name.
    render(
      <ComposerToken
        glyph="🔎"
        label="Websuche"
        removeLabel="Websuche entfernen"
        onRemove={() => {}}
      />
    );
    expect(screen.queryByText('🔎')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Websuche')).not.toHaveAttribute('aria-hidden');
  });
});
