/**
 * axe-Wächter für die Bedienflächen, die Aufgaben 1–10 nicht ohnehin schon
 * prüfen: Kontextleiste (Text, Balken), die mobile Bereichs-Leiste, die
 * Auswahl-Leiste, die Pille und der Text-Editor beim Bearbeiten. Desktop-
 * Bereichs-Leiste, Foto-Leiste, Ebenen-Liste und Seiten-Gruppe stehen in
 * `controlNames`, `contextBarCrop`, `layersSection` und `pageWrapperSemantics`.
 *
 * jsdom hat kein Layout: Kontrast und Zielgröße misst die Playwright-Lane
 * (`apps/web/tests/e2e/a11y.spec.ts`), hier geht es um Namen, Rollen, ARIA.
 */
import {
  CanvasTextEditorProvider,
  preloadRichText,
} from '@ggraphic/editor/components/CanvasTextOverlay';
import { SelectionPill } from '@ggraphic/editor/components/SelectionPill';
import { ContextControls } from '@ggraphic/editor/components/TopBar/ContextControls';
import { MobileSelectionBar } from '@ggraphic/editor/components/TopBar/MobileSelectionBar';
import { CanvasStage, type CanvasStageRef } from '@ggraphic/editor/primitives/CanvasStage';
import { CanvasText } from '@ggraphic/editor/primitives/CanvasText';
import { SidebarPanel } from '@ggraphic/editor/sidebar/SidebarPanel';
import { SidebarTabBar } from '@ggraphic/editor/sidebar/SidebarTabBar';
import { CanvasStoreProvider } from '@ggraphic/editor/stores/CanvasStoreProvider';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import type { FloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';
import type { SidebarTab } from '@ggraphic/editor/sidebar/types';

vi.hoisted(() => {
  const target = new EventTarget() as EventTarget & {
    check: () => boolean;
    ready: Promise<void>;
    load: () => Promise<never[]>;
  };
  target.check = () => false;
  target.ready = Promise.resolve();
  target.load = () => Promise.resolve([]);
  Object.defineProperty(document, 'fonts', { value: target, configurable: true });
});

function setMobile(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mobile && query.includes('max-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  cleanup();
  document.body.querySelectorAll('input, textarea').forEach((el) => el.remove());
});

beforeAll(() => preloadRichText());

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
};

function Icon() {
  return <svg aria-hidden="true" />;
}

function contextBar(module: FloatingModuleState, id: string) {
  return (
    <CanvasTextEditorProvider>
      <ContextControls
        selectedElement={id}
        activeFloatingModule={module}
        canMoveUp
        canMoveDown
        canDuplicate
        handlers={HANDLERS}
      />
    </CanvasTextEditorProvider>
  );
}

describe('Kontextleiste (axe)', () => {
  it('Text', async () => {
    setMobile(false);
    const { container } = render(
      contextBar({ type: 'text', data: { id: 't1', fontSize: 24, fill: '#005538' } }, 't1')
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Balken', async () => {
    setMobile(false);
    const { container } = render(
      contextBar({ type: 'balken', data: { id: 'b1', opacity: 1 } }, 'b1')
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('mobile Bereichs-Leiste (axe)', () => {
  it('benennt jeden Bereich und bleibt ohne Verstöße', async () => {
    setMobile(true);
    const tabs: SidebarTab[] = [
      { id: 'text', icon: Icon, label: 'Text', ariaLabel: 'Text hinzufügen' },
      { id: 'uploads', icon: Icon, label: 'Uploads', ariaLabel: 'Uploads öffnen' },
    ];
    const { container } = render(
      <>
        <SidebarTabBar tabs={tabs} activeTab="text" onTabClick={() => {}} />
        <SidebarPanel isOpen title="Text">
          <p>Inhalt</p>
        </SidebarPanel>
      </>
    );
    expect(screen.getByRole('button', { name: 'Text hinzufügen' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('MobileSelectionBar (axe)', () => {
  it('ist eine benannte Werkzeugleiste ohne Verstöße', async () => {
    setMobile(true);
    const { container } = render(
      <CanvasStoreProvider>
        <MobileSelectionBar
          selectedElement="shape-1"
          activeFloatingModule={{ type: 'shape', data: { id: 'shape-1', fill: '#005538' } }}
          canMoveUp
          canMoveDown={false}
          canDuplicate
          handlers={HANDLERS}
          onDeletePage={() => {}}
          onDeselect={() => {}}
          onDone={() => {}}
          onOpenArea={() => {}}
        />
      </CanvasStoreProvider>
    );
    expect(screen.getByRole('toolbar', { name: 'Auswahl bearbeiten' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('SelectionPill (axe)', () => {
  it.each(['touch', 'pointer'] as const)(
    '%s: benannte Werkzeugleiste ohne Verstöße',
    async (variant) => {
      setMobile(variant === 'touch');
      const { container } = render(
        <SelectionPill
          variant={variant}
          onToggleLock={() => {}}
          measureKey="a"
          zoom={1}
          getBox={() => ({
            left: 100,
            top: 300,
            width: 80,
            height: 60,
            visible: { left: 0, top: 52, right: 390, bottom: 600 },
            rotaters: [],
          })}
          subscribeManipulation={() => () => {}}
          canDuplicate
          canDelete
          onDuplicate={() => {}}
          onDelete={() => {}}
          onMore={() => {}}
        />
      );
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });
      expect(screen.getByRole('toolbar', { name: 'Element' })).toBeInTheDocument();
      expect(await axe(container)).toHaveNoViolations();
    }
  );
});

describe('CanvasTextOverlay beim Bearbeiten (axe)', () => {
  it('der offene Editor ist ein benanntes Textfeld ohne Verstöße', async () => {
    setMobile(false);
    const stageRef = createRef<CanvasStageRef>();
    render(
      <CanvasStage ref={stageRef} width={600} height={600}>
        <CanvasText
          id="text-1"
          x={10}
          y={20}
          width={400}
          fontSize={24}
          text="Klimaschutz"
          editable
          onTextChange={() => {}}
        />
      </CanvasStage>
    );
    const node = stageRef.current?.getStage()?.findOne('#text-1');
    if (!node) throw new Error('Textknoten nicht gefunden');
    act(() => {
      node.fire('dblclick');
    });
    const overlay = document.querySelector<HTMLElement>('body > div[style*="z-index: 10000"]');
    if (!overlay) throw new Error('Editor nicht geöffnet');
    expect(overlay.querySelector('[role="textbox"]')).not.toBeNull();
    expect(await axe(overlay)).toHaveNoViolations();
  });
});
