import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { AutoSaveIndicator } from '@ggraphic/editor/components/TopBar/AutoSaveIndicator';
import { FloatingColorPicker } from '@ggraphic/editor/components/TopBar/modules/FloatingColorPicker';
import { FloatingFontSizeControl } from '@ggraphic/editor/components/TopBar/modules/FloatingFontSizeControl';
import { FloatingHistoryControls } from '@ggraphic/editor/components/TopBar/modules/FloatingHistoryControls';
import { FloatingLayerControls } from '@ggraphic/editor/components/TopBar/modules/FloatingLayerControls';
import { SidebarHint } from '@ggraphic/editor/sidebar/components/SidebarHint';
import { FontSizeStepper } from '@ggraphic/editor/sidebar/components/TextFieldPrimitives';
import {
  AutoSaveStoreProvider,
  useAutoSaveStoreApi,
} from '@ggraphic/editor/stores/useAutoSaveStore';
import { render, screen } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { PiTextAa } from 'react-icons/pi';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CombinedTextSection } from '@ggraphic/editor/sidebar/sections/CombinedTextSection';
import { SidebarPanel } from '../../sidebar/SidebarPanel';
import { SubsectionTabBar } from '@ggraphic/editor/sidebar/SubsectionTabBar';
import { ContextControls } from '@ggraphic/editor/components/TopBar/ContextControls';

import type { FloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';

function setMobileViewport() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('max-width: 899px'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** 44pt: either grows on mobile (size-11) or gets an invisible hit area (touch-target / ::before). */
function expectBigTarget(el: HTMLElement) {
  const cls = el.className;
  const ok =
    /\btouch-target\b/.test(cls) ||
    cls.includes('max-canvas-mobile:size-11') ||
    cls.includes('max-canvas-mobile:h-11') ||
    cls.includes('max-canvas-mobile:before:inset-[-9px]');
  expect(ok, `kein 44pt-Ziel: ${cls}`).toBe(true);
}

describe('44pt-Ziele', () => {
  beforeEach(setMobileViewport);

  it('Sheet-Schließen-Knopf', () => {
    render(
      <SidebarPanel isOpen title="Text" onClose={() => {}}>
        <p>Inhalt</p>
      </SidebarPanel>
    );
    expect(screen.getByRole('button', { name: 'Text schließen' })).toHaveClass(
      'max-canvas-mobile:size-11'
    );
  });

  it('Filter-Chips', () => {
    render(
      <SubsectionTabBar
        subsections={[
          { id: 'a', icon: PiTextAa, label: 'Eins', content: <p>a</p> },
          { id: 'b', icon: PiTextAa, label: 'Zwei', content: <p>b</p> },
        ]}
      />
    );
    for (const tab of screen.getAllByRole('tab')) expectBigTarget(tab);
  });

  it('Auswahl-Leiste', () => {
    const module: FloatingModuleState = { type: 'shape', data: { id: 's', fill: '#005538' } };
    render(
      <ContextControls
        selectedElement="s"
        activeFloatingModule={module}
        canMoveUp
        canMoveDown
        canDuplicate
        onDeselect={() => {}}
        handlers={{
          handleMoveLayer: () => {},
          handleDuplicate: () => {},
          handleColorSelect: () => {},
          handleOpacityChange: () => {},
          handleFontSizeChange: () => {},
        }}
      />
    );
    for (const name of ['Duplizieren (Strg+D)', 'Auswahl aufheben (Esc)']) {
      expectBigTarget(screen.getByRole('button', { name }));
    }
  });

  it('Farbfelder', () => {
    render(<FloatingColorPicker currentColor="#005538" onColorSelect={() => {}} isExpanded />);
    const swatches = screen.getAllByRole('button');
    expect(swatches.length).toBeGreaterThan(2);
    for (const s of swatches) expectBigTarget(s);
  });

  it('swatch hit areas do not overlap neighbours', () => {
    const { container } = render(
      <FloatingColorPicker currentColor="#005538" onColorSelect={() => {}} isExpanded />
    );
    const row = container.firstElementChild as HTMLElement;
    // 26px swatch + 9px hit area per side = 44px, so the gap must be >= 2 x 9px
    expect(row).toHaveClass('max-canvas-mobile:gap-[18px]');
    for (const s of screen.getAllByRole('button')) {
      expect(s.className).toContain('max-canvas-mobile:before:inset-[-9px]');
    }
  });

  it('Farb-Knopf eingeklappt', () => {
    render(<FloatingColorPicker currentColor="#005538" onColorSelect={() => {}} />);
    expectBigTarget(screen.getByRole('button', { name: 'Farbpalette öffnen' }));
  });

  it('Schriftgröße (Leiste und Stepper)', () => {
    render(
      <>
        <FloatingFontSizeControl fontSize={40} onFontSizeChange={() => {}} />
        <FontSizeStepper value={40} onChange={() => {}} />
      </>
    );
    for (const name of [
      'Schrift verkleinern',
      'Schrift vergrößern',
      'Schriftgröße verringern',
      'Schriftgröße erhöhen',
    ]) {
      const btn = screen.queryByRole('button', { name }) ?? screen.getByTitle(name);
      expectBigTarget(btn);
    }
  });

  it('Ebenen-Knöpfe', () => {
    render(
      <FloatingLayerControls onMoveUp={() => {}} onMoveDown={() => {}} canMoveUp canMoveDown />
    );
    expectBigTarget(screen.getByRole('button', { name: 'Ebene nach oben' }));
    expectBigTarget(screen.getByRole('button', { name: 'Ebene nach unten' }));
  });

  it('Hinweis-Knopf', () => {
    render(<SidebarHint>Tipp</SidebarHint>);
    expectBigTarget(screen.getByRole('button', { name: 'Hinweis anzeigen' }));
  });

  it('Text-Kacheln', () => {
    render(
      <CombinedTextSection onAddHeader={() => {}} onAddSubheader={() => {}} onAddText={() => {}} />
    );
    for (const name of [
      'Überschrift hinzufügen',
      'Untertitel hinzufügen',
      'Fließtext hinzufügen',
    ]) {
      const cls = screen.getByRole('button', { name }).className;
      expect(cls, name).toMatch(/\bh-1[1-9]\b/);
    }
  });

  // The add-page button under the page sits inside the scaled pages container
  // (fit + zoom shrink it to ~145×18 on a phone); it counter-scales back to
  // its 44 px height. CanvasEditor is too heavy to render here.
  it('Seite hinzufügen unter der Fläche', () => {
    const source = readFileSync(
      path.resolve(import.meta.dirname, '../CanvasEditor/index.tsx'),
      'utf8'
    );
    const wrapper = /<div className="([^"]*canvas-mobile:hidden[^"]*)">\s*<AddPageButton/.exec(
      source
    );
    expect(wrapper?.[1]).toContain('max-canvas-mobile:[scale:calc(1/var(--canvas-total-scale,1))]');
    expect(wrapper?.[1]).toContain('max-canvas-mobile:origin-top');
  });

  // Web top bar (browser only on phones; the app draws a native header).
  it('Rückgängig/Wiederholen in der Menüleiste', () => {
    for (const onDark of [false, true]) {
      const { unmount } = render(
        <FloatingHistoryControls
          onUndo={() => {}}
          onRedo={() => {}}
          canUndo
          canRedo
          onDark={onDark}
        />
      );
      expectBigTarget(screen.getByTitle(/^Rückgängig/));
      expectBigTarget(screen.getByTitle(/^Wiederholen/));
      unmount();
    }
  });

  it('Speichern erneut versuchen', () => {
    function SaveFailed() {
      const api = useAutoSaveStoreApi();
      useLayoutEffect(() => api.setState({ autoSaveStatus: 'error' }), [api]);
      return null;
    }
    render(
      <AutoSaveStoreProvider>
        <SaveFailed />
        <AutoSaveIndicator onDark />
      </AutoSaveStoreProvider>
    );
    expectBigTarget(screen.getByRole('button', { name: 'Speichern erneut versuchen' }));
  });

  // Native <input type="range">: the input itself is the hit area.
  it.each([
    'sidebar/sections/FrameSettingsSection.tsx',
    'sidebar/sections/tools/TextPathCreatorTool.tsx',
    'sidebar/sections/tools/GradientTextTool.tsx',
    'sidebar/sections/tools/BlobCreatorTool.tsx',
    'components/TopBar/CropModeControls.tsx',
  ])('Range-Regler %s ist auf dem Handy 44 px hoch', (file) => {
    // the file may already live in the core package after a move
    const source = readFileSync(
      [
        path.resolve(import.meta.dirname, '../..', file),
        path.resolve(import.meta.dirname, '../../../../ggraphic-editor/src', file),
      ].find(existsSync) ?? file,
      'utf8'
    );
    const ranges = [...source.matchAll(/type="range"[\s\S]*?className="([^"]*)"/g)];
    expect(ranges.length).toBeGreaterThan(0);
    for (const [, cls] of ranges) expect(cls).toContain('max-canvas-mobile:h-11');
  });

  // touch-target keys on pointer: coarse — the input must sit above the
  // buttons' hit areas under the same condition, also on a touch iPad.
  it('Schriftgrößen-Feld liegt über den Trefferflächen der Knöpfe', () => {
    render(<FontSizeStepper value={40} onChange={() => {}} />);
    const input = screen.getByRole('spinbutton');
    expect(input.className).toContain('pointer-coarse:relative');
    expect(input.className).toContain('pointer-coarse:z-[1]');
  });
});
