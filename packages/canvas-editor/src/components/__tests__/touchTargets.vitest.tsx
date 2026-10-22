import { render, screen } from '@testing-library/react';
import { PiTextAa } from 'react-icons/pi';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FontSizeStepper } from '../../sidebar/components/TextFieldPrimitives';
import { SidebarPanel } from '../../sidebar/SidebarPanel';
import { SubsectionTabBar } from '../../sidebar/SubsectionTabBar';
import { ContextControls } from '../TopBar/ContextControls';
import { FloatingColorPicker } from '../TopBar/modules/FloatingColorPicker';
import { FloatingFontSizeControl } from '../TopBar/modules/FloatingFontSizeControl';

import type { FloatingModuleState } from '../../hooks/useFloatingModuleState';

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
});
