/**
 * Der Host merkt sich den offenen Reiter je Canvas (#4258): ohne `initialTab`
 * war der Chat nach jedem Neuladen zu, weil `activeTab` mit `null` startet.
 */
import { act, render, screen } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider, type ChatSectionContentProps } from '../../../CanvasEditorProvider';
import { CanvasEditor } from '../index';

import type { SidebarTabId } from '../../../sidebar/types';

vi.mock('../../../sidebar/UserUploadsProvider', () => ({
  UserUploadsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUserUploads: () => ({ uploads: [], refresh: () => {} }),
}));

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

// `useIsCanvasMobile` fragt `(max-width: 899px)`; je Fall umschaltbar.
let mobile = false;
vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: mobile && query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
);

vi.spyOn(Konva.Stage.prototype, 'toDataURL').mockReturnValue('data:,');
Element.prototype.scrollIntoView ??= () => {};

async function renderEditor(props: {
  initialTab?: SidebarTabId | null;
  onActiveTabChange?: (tab: SidebarTabId | null) => void;
}) {
  await act(async () => {
    render(
      <CanvasEditor
        initialConfigId="dreizeilen"
        initialProps={{}}
        onExport={() => {}}
        onCancel={() => {}}
        {...props}
      />
    );
  });
  for (let i = 0; i < 50 && !screen.queryByRole('button', { name: /KI-Chat/ }); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  return screen.getByRole('button', { name: /KI-Chat/ });
}

describe('CanvasEditor initialTab', () => {
  beforeEach(() => {
    mobile = false;
  });

  it('öffnet den mitgegebenen Reiter beim ersten Render', async () => {
    const chatTab = await renderEditor({ initialTab: 'chat' });
    expect(chatTab).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Chat ist in dieser Umgebung nicht verfügbar.')).toBeTruthy();
  });

  it('startet ohne initialTab geschlossen', async () => {
    const chatTab = await renderEditor({});
    expect(chatTab).toHaveAttribute('aria-pressed', 'false');
  });

  it('meldet Reiterwechsel an den Host', async () => {
    const onActiveTabChange = vi.fn();
    const chatTab = await renderEditor({ initialTab: null, onActiveTabChange });
    await act(async () => {
      chatTab.click();
    });
    expect(onActiveTabChange).toHaveBeenLastCalledWith('chat');
    await act(async () => {
      chatTab.click();
    });
    expect(onActiveTabChange).toHaveBeenLastCalledWith(null);
  });

  it('ignoriert den gemerkten Reiter mobil und meldet dort nichts', async () => {
    // Mobil ist ein offener Reiter ein Sheet über der Fläche: nach dem Neuladen
    // nicht wieder aufklappen und den Desktop-Stand nicht überschreiben.
    mobile = true;
    const onActiveTabChange = vi.fn();
    const chatTab = await renderEditor({ initialTab: 'chat', onActiveTabChange });
    expect(chatTab).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Chat ist in dieser Umgebung nicht verfügbar.')).toBeNull();
    await act(async () => {
      chatTab.click();
    });
    expect(chatTab).toHaveAttribute('aria-pressed', 'true');
    expect(onActiveTabChange).not.toHaveBeenCalled();
  });
});

describe('CanvasEditor Chat über Seitenwechsel (#4273)', () => {
  beforeEach(() => {
    mobile = false;
  });

  let mounts = 0;
  function SpyChat(_props: ChatSectionContentProps) {
    React.useEffect(() => {
      mounts++;
    }, []);
    return <div>spy-chat</div>;
  }

  async function renderDeck() {
    mounts = 0;
    await act(async () => {
      render(
        <CanvasEditorProvider services={{ ChatSectionContent: SpyChat }}>
          <CanvasEditor
            initialConfigId="dreizeilen"
            initialProps={{}}
            initialPages={[
              { id: 'a', configId: 'dreizeilen', state: {} },
              { id: 'b', configId: 'dreizeilen', state: {} },
            ]}
            initialTab="chat"
            onExport={() => {}}
            onCancel={() => {}}
          />
        </CanvasEditorProvider>
      );
    });
    await screen.findByText('spy-chat');
    expect(mounts).toBe(1);
  }

  async function settle() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  }

  it('hält den Chat beim Seitenwechsel gemountet', async () => {
    await renderDeck();
    await act(async () => {
      document.querySelector<HTMLElement>('[data-page-index="1"]')!.click();
    });
    await settle();
    expect(document.querySelector('[data-page-index="1"]')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('spy-chat')).toBeTruthy();
    expect(mounts).toBe(1);
  });

  it('hält den Chat gemountet, wenn die aktive Seite gelöscht wird', async () => {
    await renderDeck();
    const activePage = document.querySelector<HTMLElement>('[data-page-index="0"]')!;
    await act(async () => {
      activePage.querySelector<HTMLElement>('[title="Seite löschen"]')!.click();
    });
    await settle();
    expect(document.querySelector('[data-page-index="1"]')).toBeNull();
    expect(screen.getByText('spy-chat')).toBeTruthy();
    expect(mounts).toBe(1);
  });
});
