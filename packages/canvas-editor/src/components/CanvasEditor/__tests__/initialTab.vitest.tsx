/**
 * Der Host merkt sich den offenen Reiter je Canvas (#4258): ohne `initialTab`
 * war der Chat nach jedem Neuladen zu, weil `activeTab` mit `null` startet.
 */
import { act, render, screen } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

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

// Desktop: `useIsCanvasMobile` fragt `(max-width: 899px)`.
vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: false,
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
});
