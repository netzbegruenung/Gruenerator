/**
 * Radix gibt jedem Popover `role="dialog"`; ohne Namen meldet axe
 * `aria-dialog-name` (#4911). Jedes Popover der Kontextleiste trägt deshalb
 * die sichtbare Überschrift als Namen.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { axe } from '../../../test-utils';

import { BackgroundZoomControl } from '@ggraphic/editor/components/TopBar/modules/FloatingBackgroundControls';
import { FloatingGradientControl } from '@ggraphic/editor/components/TopBar/modules/FloatingGradientControl';
import { FloatingOutlineControl } from '@ggraphic/editor/components/TopBar/modules/FloatingOutlineControl';
import { FloatingShadowControl } from '@ggraphic/editor/components/TopBar/modules/FloatingShadowControl';

import type { ReactElement } from 'react';

const cases: Array<{ trigger: string; dialog: string; ui: ReactElement }> = [
  {
    trigger: 'Schatten bearbeiten',
    dialog: 'Schatten',
    ui: <FloatingShadowControl onChange={() => {}} />,
  },
  {
    trigger: 'Farbverlauf bearbeiten',
    dialog: 'Farbverlauf',
    ui: <FloatingGradientControl currentColor="#316049" onChange={() => {}} />,
  },
  {
    trigger: 'Textkontur bearbeiten',
    dialog: 'Kontur',
    ui: <FloatingOutlineControl onChange={() => {}} />,
  },
  {
    trigger: 'Bild zoomen',
    dialog: 'Zoom',
    ui: <BackgroundZoomControl scale={1} onScaleChange={() => {}} />,
  },
];

describe('floating popovers', () => {
  it.each(cases)('names the $trigger popover', async ({ trigger, dialog, ui }) => {
    const { baseElement } = render(ui);
    await userEvent.click(screen.getByRole('button', { name: trigger }));

    expect(screen.getByRole('dialog', { name: dialog })).toBeTruthy();
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
