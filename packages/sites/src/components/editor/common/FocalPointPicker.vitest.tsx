import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { FocalPointPicker } from './FocalPointPicker';

describe('FocalPointPicker', () => {
  it('is a 5x5 radiogroup labelled Bildausschnitt with the centre checked by default', () => {
    render(<FocalPointPicker src="/a.png" value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: 'Bildausschnitt' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(25);
    expect(screen.getByRole('radio', { name: 'Mitte' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'halblinks halboben' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'rechts unten' })).toBeTruthy();
  });

  it('ArrowRight moves the focus from 50 to 75', async () => {
    const onChange = vi.fn();
    render(<FocalPointPicker src="/a.png" value={{ x: 50, y: 50 }} onChange={onChange} />);
    screen.getByRole('radio', { name: 'Mitte' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith({ x: 75, y: 50 });
  });

  it('arrows clamp at the edges', async () => {
    const onChange = vi.fn();
    render(<FocalPointPicker src="/a.png" value={{ x: 0, y: 100 }} onChange={onChange} />);
    screen.getByRole('radio', { name: 'links unten' }).focus();
    await userEvent.keyboard('{ArrowLeft}{ArrowDown}');
    expect(onChange).toHaveBeenNthCalledWith(1, { x: 0, y: 100 });
    expect(onChange).toHaveBeenNthCalledWith(2, { x: 0, y: 100 });
    await userEvent.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith({ x: 0, y: 75 });
  });

  it('only the checked radio is a tab stop, and a click selects its cell', async () => {
    const onChange = vi.fn();
    render(<FocalPointPicker src="/a.png" value={{ x: 25, y: 75 }} onChange={onChange} />);
    expect(document.querySelectorAll('[role=radio][tabindex="0"]')).toHaveLength(1);
    await userEvent.click(screen.getByRole('radio', { name: 'rechts oben' }));
    expect(onChange).toHaveBeenCalledWith({ x: 100, y: 0 });
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <FocalPointPicker src="/a.png" value={{ x: 25, y: 75 }} onChange={vi.fn()} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
