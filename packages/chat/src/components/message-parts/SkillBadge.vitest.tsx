import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SkillBadge } from './SkillBadge';

import type { SkillIcon } from '@gruenerator/shared/agents';

const FakeIcon: SkillIcon = ({ className }) => (
  <svg data-testid="skill-icon" className={className} />
);

describe('SkillBadge', () => {
  it('renders the title and applies the background color to the avatar chip', () => {
    render(<SkillBadge avatar="G" title="Pressemitteilung" backgroundColor="rgb(0, 128, 0)" />);
    expect(screen.getByText('Pressemitteilung')).toBeInTheDocument();
    const chip = screen.getByText('G');
    expect(chip).toHaveStyle({ backgroundColor: 'rgb(0, 128, 0)' });
  });

  it('renders the fallback letter avatar when no icon is given', () => {
    render(<SkillBadge avatar="X" title="Fallback" backgroundColor="#000" />);
    expect(screen.getByText('X')).toBeInTheDocument();
    expect(screen.queryByTestId('skill-icon')).not.toBeInTheDocument();
  });

  it('prefers the icon component over the letter avatar when both are provided', () => {
    render(<SkillBadge avatar="X" icon={FakeIcon} title="Icon wins" backgroundColor="#000" />);
    expect(screen.getByTestId('skill-icon')).toBeInTheDocument();
    // The avatar letter is not rendered as text once an icon takes its place.
    expect(screen.queryByText('X')).not.toBeInTheDocument();
  });
});
