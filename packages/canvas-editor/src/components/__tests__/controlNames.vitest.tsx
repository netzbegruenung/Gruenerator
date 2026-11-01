import { CanvasMetaBar } from '@ggraphic/editor/components/CanvasMetaBar';
import { PageToolbar } from '@ggraphic/editor/components/PageToolbar';
import { FloatingColorPicker } from '@ggraphic/editor/components/TopBar/modules/FloatingColorPicker';
import { FloatingFontSizeControl } from '@ggraphic/editor/components/TopBar/modules/FloatingFontSizeControl';
import { FloatingOpacityControl } from '@ggraphic/editor/components/TopBar/modules/FloatingOpacityControl';
import { SidebarSlider } from '@ggraphic/editor/sidebar/components/SidebarSlider';
import { ShadowSettings } from '@ggraphic/editor/sidebar/sections/effects/ShadowSettings';
import { SidebarPanel } from '@ggraphic/editor/sidebar/SidebarPanel';
import { SidebarTabBar } from '@ggraphic/editor/sidebar/SidebarTabBar';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toolsTab, uploadsTab } from '../../configs/commonSections';
import { BalkenSettingsSection } from '../../sidebar/sections/BalkenSettingsSection';
import { axe } from '../../test-utils';
import { COLOR_SCHEMES } from '../../utils/dreizeilenLayout';

import type { BalkenInstance } from '../../utils/balkenUtils';
import type { SidebarTab } from '@ggraphic/editor/sidebar/types';

beforeEach(() => {
  // Desktop layout.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

function Icon() {
  return <svg aria-hidden="true" />;
}

describe('sidebar tab bar', () => {
  const tabs: SidebarTab[] = [
    { id: 'text', icon: Icon, label: 'Text', ariaLabel: 'Text hinzufügen' },
    uploadsTab,
    toolsTab,
  ];

  it('starts every accessible name with the visible label and exposes expanded/controls', async () => {
    const { container } = render(
      <>
        <SidebarTabBar tabs={tabs} activeTab="text" onTabClick={() => {}} />
        <SidebarPanel isOpen title="Text">
          <p>Inhalt</p>
        </SidebarPanel>
      </>
    );
    for (const tab of tabs) {
      const button = screen.getByRole('button', { name: new RegExp(`^${tab.label}`) });
      expect(button.getAttribute('aria-label')?.startsWith(tab.label)).toBe(true);
      expect(button).toHaveAttribute('aria-expanded', tab.id === 'text' ? 'true' : 'false');
    }
    const text = screen.getByRole('button', { name: 'Text hinzufügen' });
    const panelId = text.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).not.toBeNull();
    expect(screen.getByRole('navigation', { name: 'Editor-Bereiche' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('sliders', () => {
  it('SidebarSlider names its thumb with the label and reports a percent value text', async () => {
    const { container } = render(
      <SidebarSlider label="Stärke" unit="%" value={0.5} onValueChange={() => {}} />
    );
    const thumb = screen.getByRole('slider', { name: 'Stärke' });
    expect(thumb).toHaveAttribute('aria-valuetext', '50 %');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FloatingOpacityControl is "Deckkraft" with a percent value text', async () => {
    const { container } = render(<FloatingOpacityControl opacity={1} onOpacityChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Deckkraft' }));
    expect(screen.getByRole('slider', { name: 'Deckkraft' })).toHaveAttribute(
      'aria-valuetext',
      '100 %'
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Balken settings', () => {
  const balken: BalkenInstance = {
    id: 'b1',
    mode: 'triple',
    colorSchemeId: COLOR_SCHEMES[0].id,
    widthScale: 1,
    offset: { x: 0, y: 0 },
    scale: 1,
    texts: ['a', 'b', 'c'],
    rotation: 0,
    barOffsets: [0, 0, 0],
  };

  it('names the fine-tuning buttons per line and the scheme swatches with state', async () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <BalkenSettingsSection
        selectedBalken={balken}
        onUpdateBalken={onUpdate}
        onRemoveBalken={() => {}}
        colorSchemes={COLOR_SCHEMES}
        isPrimary={false}
      />
    );
    for (let line = 1; line <= 3; line++) {
      expect(
        screen.getAllByRole('button', { name: `Zeile ${line} nach links verschieben` }).length
      ).toBeGreaterThan(0);
    }
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Zeile 2 nach rechts verschieben' })[0]
    );
    expect(onUpdate).toHaveBeenCalledWith('b1', { barOffsets: [0, 5, 0] });
    expect(screen.getAllByRole('button', { pressed: true }).length).toBeGreaterThan(0);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('colour swatches', () => {
  it('FloatingColorPicker names brand colours and marks the current one', async () => {
    const { container } = render(
      <FloatingColorPicker
        currentColor="#005538"
        onColorSelect={() => {}}
        isExpanded
        onExpandChange={() => {}}
        allowCustom={false}
      />
    );
    expect(screen.getByRole('button', { name: 'Tanne', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sand', pressed: false })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Farbpalette' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shadow popover falls back to "Farbe #RRGGBB" for non-brand colours', async () => {
    const { baseElement } = render(
      <ShadowSettings shadowColor="#316049" shadowBlur={4} onChange={() => {}} />
    );
    const swatch = await screen.findByRole('button', { name: 'Farbe #316049', pressed: true });
    expect(swatch).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schwarz', pressed: false })).toBeInTheDocument();
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

describe('icon-only buttons', () => {
  it('carry an aria-label next to their title', async () => {
    const { container } = render(
      <>
        <PageToolbar
          pageIndex={1}
          pageCount={3}
          isActive
          onMoveUp={() => {}}
          onMoveDown={() => {}}
          onDuplicate={() => {}}
          onChangeTemplate={() => {}}
          onDelete={() => {}}
        />
        <FloatingFontSizeControl fontSize={20} onFontSizeChange={() => {}} />
        <CanvasMetaBar pageCount={2} currentPageIndex={0} zoom={1} onZoomChange={() => {}} />
      </>
    );
    for (const name of [
      'Seite nach oben verschieben',
      'Seite nach unten verschieben',
      'Seite duplizieren',
      'Vorlage ändern',
      'Seite löschen',
      'Schrift verkleinern',
      'Schrift vergrößern',
      'Verkleinern',
      'Vergrößern',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Vollbild', pressed: false })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
