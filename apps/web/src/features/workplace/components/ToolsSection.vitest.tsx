import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../stores/authStore';

import { OfficeActionTile, OfficeSection } from './ToolsSection';

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
});

describe('OfficeSection', () => {
  it('sizes the Weitere tiles exactly like the area tiles above them', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <OfficeSection />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /Weitere/ }));

    const rows = [...container.querySelectorAll<HTMLElement>('[style*="--tile-basis"]')];
    expect(rows).toHaveLength(2);
    const [areaRow, menuRow] = rows;
    // The rows differ in length — sized by their own count they'd differ in width.
    expect(menuRow.children.length).not.toBe(areaRow.children.length);
    expect(menuRow.style.getPropertyValue('--tile-basis')).toBe(
      areaRow.style.getPropertyValue('--tile-basis')
    );
  });
});

describe('OfficeSection sites tile', () => {
  const renderStrip = (user: Record<string, unknown>) => {
    useAuthStore.setState({ user: user as never });
    render(
      <MemoryRouter>
        <OfficeSection />
      </MemoryRouter>
    );
  };

  it('is absent for accounts that are not unlocked', () => {
    renderStrip({ id: 'u', sites_unlocked: false });
    expect(screen.queryByText('Website für deine Kandidatur')).toBeNull();
  });

  it('is present for unlocked accounts, also with locale de-AT', () => {
    renderStrip({ id: 'u', sites_unlocked: true, locale: 'de-AT' });
    expect(screen.getByText('Website für deine Kandidatur')).toBeInTheDocument();
  });
});
