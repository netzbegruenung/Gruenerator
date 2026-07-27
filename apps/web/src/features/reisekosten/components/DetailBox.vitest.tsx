import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe } from '../../../test-utils';

import { DetailBox } from './DetailBox';

describe('DetailBox', () => {
  it('renders the emoji, title and children', () => {
    render(
      <DetailBox emoji="🚆" title="Bahn">
        <span>Kind-Inhalt</span>
      </DetailBox>
    );
    expect(screen.getByText('🚆')).toBeInTheDocument();
    expect(screen.getByText('Bahn')).toBeInTheDocument();
    expect(screen.getByText('Kind-Inhalt')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <DetailBox emoji="🚆" title="Bahn">
        <span>Kind-Inhalt</span>
      </DetailBox>
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
