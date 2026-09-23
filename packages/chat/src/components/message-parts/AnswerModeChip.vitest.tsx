import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe } from '../../test-utils';

import { AnswerModeChip } from './AnswerModeChip';

describe('AnswerModeChip', () => {
  it('names the mode the answer ran in', () => {
    const { rerender } = render(<AnswerModeChip mode="praezision" />);
    expect(screen.getByText('Präzisionsmodus')).toBeInTheDocument();
    rerender(<AnswerModeChip mode="chat" />);
    expect(screen.getByText('Chatmodus')).toBeInTheDocument();
  });

  it('adds "automatisch gewählt" only when the auto guard decided', () => {
    const { rerender } = render(<AnswerModeChip mode="praezision" reason="guard" />);
    expect(screen.getByText('automatisch gewählt')).toBeInTheDocument();
    rerender(<AnswerModeChip mode="chat" reason="guard_fallback" />);
    expect(screen.getByText('automatisch gewählt')).toBeInTheDocument();
    rerender(<AnswerModeChip mode="praezision" reason="pregate" />);
    expect(screen.getByText('automatisch gewählt')).toBeInTheDocument();
    rerender(<AnswerModeChip mode="praezision" reason="explicit" />);
    expect(screen.queryByText('automatisch gewählt')).toBeNull();
    rerender(<AnswerModeChip mode="chat" reason={null} />);
    expect(screen.queryByText('automatisch gewählt')).toBeNull();
  });

  it('reads as plain text: the icon and the separator stay out of the tree', async () => {
    const { container } = render(<AnswerModeChip mode="praezision" reason="guard" />);
    expect(container.textContent).toBe('Präzisionsmodus·automatisch gewählt');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden');
    expect(await axe(container)).toHaveNoViolations();
  });
});
