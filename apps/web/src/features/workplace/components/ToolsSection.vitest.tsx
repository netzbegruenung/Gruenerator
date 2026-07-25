import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OfficeActionTile } from './ToolsSection';

import type { IconType } from '../../../config/icons';

// A stand-in icon — OfficeTileInner just renders <Icon/>, the glyph is irrelevant.
const Icon: IconType = () => <svg data-testid="tile-icon" />;

function renderTile(props?: Partial<Parameters<typeof OfficeActionTile>[0]>) {
  const onClick = vi.fn();
  render(
    <OfficeActionTile
      styleKey="docs"
      icon={Icon}
      title="Neues Dokument"
      description="Leeres Dokument anlegen"
      onClick={onClick}
      {...props}
    />
  );
  return { onClick };
}

describe('OfficeActionTile', () => {
  it('renders the title and description', () => {
    renderTile();
    expect(screen.getByText('Neues Dokument')).toBeInTheDocument();
    expect(screen.getByText('Leeres Dokument anlegen')).toBeInTheDocument();
  });

  it('is an action button (not a link) and fires onClick', async () => {
    const user = userEvent.setup();
    const { onClick } = renderTile();
    const button = screen.getByRole('button');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the tool theme tile class for a known styleKey', () => {
    renderTile({ styleKey: 'docs' });
    // getToolTheme('docs').tile — pins the tile↔theme wiring (see config/toolTheme.ts).
    expect(screen.getByRole('button').className).toContain('bg-[#F6EFD4]');
  });

  it('falls back to a neutral tile class for an unknown styleKey', () => {
    renderTile({ styleKey: 'not-a-real-tool' });
    expect(screen.getByRole('button').className).toContain('bg-grey-50');
  });
});
