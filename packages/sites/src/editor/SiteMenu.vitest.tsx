import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SiteMenu, type SiteMenuEntry } from './SiteMenu';

const mobile = vi.hoisted(() => ({ value: false }));
vi.mock('@gruenerator/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useIsMobile: () => mobile.value,
}));

function entries(onPreview: SiteMenuEntry['onSelect']): SiteMenuEntry[] {
  return [
    { key: 'preview', label: 'Vorschau', onSelect: onPreview, phoneOnly: true },
    { key: 'delete', label: 'Website löschen', onSelect: () => {}, destructive: true },
  ];
}

describe('SiteMenu', () => {
  beforeEach(() => {
    mobile.value = false;
  });

  it('leaves what the desktop bar shows out of the dropdown', async () => {
    const user = userEvent.setup();
    render(<SiteMenu title="Anna" entries={entries(() => {})} />);
    await user.click(screen.getByRole('button', { name: /Anna/ }));
    expect(await screen.findByRole('menuitem', { name: 'Website löschen' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Vorschau' })).toBeNull();
  });

  it('is only the name when nothing is left to offer', () => {
    render(<SiteMenu title="Anna" entries={[entries(() => {})[0]!]} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Anna')).toBeInTheDocument();
  });

  it('on a phone lists every entry in a sheet and runs it once the sheet is closed', async () => {
    mobile.value = true;
    const user = userEvent.setup();
    const onPreview = vi.fn();
    render(<SiteMenu title="Anna" note="Gerade dabei: Ben" entries={entries(onPreview)} />);

    const trigger = screen.getByRole('button', { name: /Anna/ });
    await user.click(trigger);
    const sheet = await screen.findByRole('dialog', { name: 'Anna' });
    expect(sheet).toHaveTextContent('Gerade dabei: Ben');

    await user.click(screen.getByRole('button', { name: 'Vorschau' }));
    await waitFor(() => expect(onPreview).toHaveBeenCalledWith(trigger));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
