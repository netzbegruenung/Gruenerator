/**
 * Radix gibt jedem Popover `role="dialog"`; ohne Namen meldet axe
 * `aria-dialog-name` (#4911). Jedes Popover der Kontextleiste trägt deshalb
 * die sichtbare Überschrift als Namen.
 */
import { BackgroundZoomControl } from '@ggraphic/editor/components/TopBar/modules/FloatingBackgroundControls';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { axe } from '../../../test-utils';

import type { ReactElement } from 'react';

const cases: Array<{ trigger: string; dialog: string; ui: ReactElement }> = [
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
