import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import { FloatingColorPicker } from './FloatingColorPicker';

function Harness({
  onSelect,
  onWindowKey,
}: {
  onSelect: (c: string) => void;
  onWindowKey: () => void;
}) {
  const [color, setColor] = useState('#008939');
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div onKeyDown={onWindowKey}>
      <FloatingColorPicker
        currentColor={color}
        onColorSelect={(c) => {
          setColor(c);
          onSelect(c);
        }}
        allowCustom={false}
      />
    </div>
  );
}

describe('FloatingColorPicker focus', () => {
  it('moves focus to the current swatch on open and back to the trigger on Escape', async () => {
    const onSelect = vi.fn();
    const onWindowKey = vi.fn();
    const { container } = render(<Harness onSelect={onSelect} onWindowKey={onWindowKey} />);

    const trigger = screen.getByRole('button', { name: 'Farbpalette öffnen', expanded: false });
    await userEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Klee', pressed: true })).toHaveFocus();
    expect(screen.getByRole('group', { name: 'Farbpalette' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Farbpalette öffnen' })).toHaveFocus();
    expect(screen.queryByRole('group', { name: 'Farbpalette' })).toBeNull();
    // Escape must not reach the canvas, and nothing was picked.
    expect(onWindowKey).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Farbpalette öffnen' }));
    expect(screen.getByRole('button', { name: 'Klee', pressed: true })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
