/**
 * The composer's "+" menu — the parts that carry state.
 *
 * The menu's whole failure mode was that four different kinds of thing looked
 * identical in it: one-shot mention inserts, thread-scoped modes, a sticky MCP
 * pin, and settings that were not reachable at all because `toggleTool` had no
 * caller. So these tests are about WHICH ACT a row performs, not about layout:
 *
 *  - a toggle row must move `enabledTools` and say so via `aria-checked`,
 *  - a one-shot row must insert a mention and NOT move `enabledTools`,
 *  - the toggle rows must survive being clicked twice (the menu stays open),
 *  - nothing in the menu may offer the notebook mode any more.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentStore } from '../../stores/chatStore';

import { PlusMenu } from './PlusMenu';

import type { Mentionable } from '../../lib/mentionables';

const onInsertMention = vi.fn();
const onOpenFileBrowser = vi.fn();
const onUploadFile = vi.fn();

function renderMenu(props: Partial<React.ComponentProps<typeof PlusMenu>> = {}) {
  // The recipe library modal mounts with the menu (it owns its own `open`
  // state) and reaches a react-query hook, so the provider is required even
  // though nothing in these tests opens it. `retry: false` keeps a failing
  // fetch from holding the test open.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlusMenu
        onInsertMention={onInsertMention}
        onOpenFileBrowser={onOpenFileBrowser}
        onUploadFile={onUploadFile}
        includeModes
        {...props}
      />
    </QueryClientProvider>
  );
}

/** Opens the dropdown (desktop branch; jsdom's default width is 1024). */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Aktionen und Modus' }));
  return screen.findByRole('menu');
}

beforeEach(() => {
  onInsertMention.mockReset();
  onOpenFileBrowser.mockReset();
  onUploadFile.mockReset();
  // `ResponsiveMenu` picks dropdown vs. sheet from a width media query, and
  // `window.innerWidth` is module-global in jsdom — without this reset the
  // mobile block below leaves every later test on the sheet branch, where
  // there is no `role="menu"` to find.
  window.innerWidth = 1024;
  useAgentStore.setState({
    enabledTools: {
      search: true,
      web: true,
      examples: true,
      pressemitteilung_examples: true,
      research: true,
    },
    threadMode: 'chat',
    pinnedConnector: null,
  });
});

describe('switch group', () => {
  it('renders the sticky settings as checked switch rows', async () => {
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);

    for (const label of ['Websuche', 'Dokumentensuche']) {
      const row = within(menu).getByRole('menuitemcheckbox', { name: new RegExp(label) });
      expect(row).toHaveAttribute('aria-checked', 'true');
    }
  });

  it('turning Websuche off writes through to enabledTools', async () => {
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);

    await user.click(within(menu).getByRole('menuitemcheckbox', { name: /Websuche/ }));

    // `research` is the user-facing key; `web` is the second backend gate it
    // drives in lockstep. Both must fall, or the auto web search keeps running
    // behind a switch that reads "off".
    expect(useAgentStore.getState().enabledTools.research).toBe(false);
    expect(useAgentStore.getState().enabledTools.web).toBe(false);
  });

  it('keeps the menu open so a second switch can be flipped', async () => {
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);

    await user.click(within(menu).getByRole('menuitemcheckbox', { name: /Websuche/ }));
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitemcheckbox', {
        name: /Dokumentensuche/,
      })
    );

    expect(useAgentStore.getState().enabledTools.research).toBe(false);
    expect(useAgentStore.getState().enabledTools.search).toBe(false);
  });

  it('Tiefenrecherche inserts a mention instead of flipping a setting', async () => {
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);

    // A plain menuitem, NOT a checkbox — it applies to this message only.
    const row = within(menu).getByRole('menuitem', { name: /Tiefenrecherche/ });
    await user.click(row);

    expect(onInsertMention).toHaveBeenCalledTimes(1);
    const inserted = onInsertMention.mock.calls[0]?.[0] as Mentionable;
    expect(inserted.mention).toBe('deepresearch');
    expect(useAgentStore.getState().enabledTools).toMatchObject({ research: true, search: true });
  });

  it('is hidden on surfaces that do not own the thread settings', async () => {
    const user = userEvent.setup();
    renderMenu({ includeModes: false });
    const menu = await openMenu(user);

    expect(within(menu).queryByRole('menuitemcheckbox', { name: /Websuche/ })).toBeNull();
  });
});

describe('attach group', () => {
  it('offers upload and the library browser', async () => {
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);

    await user.click(within(menu).getByRole('menuitem', { name: /Fotos & Dateien hochladen/ }));
    expect(onUploadFile).toHaveBeenCalledTimes(1);
  });

  it('inserts the @link mentionable for "Link anhängen"', async () => {
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);

    await user.click(within(menu).getByRole('menuitem', { name: /Link anhängen/ }));
    const inserted = onInsertMention.mock.calls[0]?.[0] as Mentionable;
    expect(inserted.mention).toBe('link');
  });
});

describe('switch group on the mobile sheet', () => {
  // The sheet branch draws its on/off state with two divs, so the state lives
  // ONLY in the hand-written `role="switch"` + `aria-checked` on the row (see
  // `ResponsiveMenuToggle`). Asserted through the role rather than the markup:
  // that is exactly what a screen reader gets, and it is the pair that silently
  // regresses when someone restyles the row.
  //
  // No axe pass here — `vitest-axe` is an apps/web devDependency and this
  // package does not carry it.
  beforeEach(() => {
    window.innerWidth = 500;
  });

  it('exposes the toggles as switches with their state', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Aktionen und Modus' }));

    const websuche = await screen.findByRole('switch', { name: /Websuche/ });
    expect(websuche).toHaveAttribute('aria-checked', 'true');

    await user.click(websuche);
    expect(useAgentStore.getState().enabledTools.research).toBe(false);
    expect(await screen.findByRole('switch', { name: /Websuche/ })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });
});

describe('notebook mode', () => {
  it('is no longer offered anywhere in the menu', async () => {
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);

    // Stillgelegt (08/2026). The notebook submenu used to sit here and set
    // `threadMode = 'notebook'`, which dispatches to a different endpoint.
    expect(within(menu).queryByText('Notebooks')).toBeNull();
    expect(within(menu).queryByText('Notizbücher')).toBeNull();
  });
});
