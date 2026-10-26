import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import { SidebarSlider } from './SidebarSlider';

describe('SidebarSlider', () => {
  it.each([
    ['%', 0.5, '50 %'],
    ['px', 12, '12 px'],
    ['°', 45, '45 °'],
    ['', 3, '3'],
  ])('nennt den Wert mit Einheit %s', (unit, value, expected) => {
    render(
      <SidebarSlider label="Wert" value={value} onValueChange={vi.fn()} max={100} unit={unit} />
    );
    expect(screen.getByRole('slider', { name: 'Wert' })).toHaveAttribute(
      'aria-valuetext',
      expected
    );
  });

  it('hat keine axe-Verstöße', async () => {
    const { container } = render(
      <SidebarSlider label="Grösse" value={12} onValueChange={vi.fn()} max={100} unit="px" />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
