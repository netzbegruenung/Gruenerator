import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders } from '../../test-utils';

import { type PickedFile, SortableFileList } from './SortableFileList';

const file = (name: string, type = 'video/mp4') => new File(['x'], name, { type });

function Harness({
  initial,
  onLastRemoved = vi.fn(),
}: {
  initial: PickedFile[];
  onLastRemoved?: () => void;
}) {
  const [items, setItems] = useState(initial);
  return (
    <>
      <SortableFileList items={items} onChange={setItems} afterLastRemoved={onLastRemoved} />
      <output data-testid="order">{items.map((i) => i.file.name).join(',')}</output>
    </>
  );
}

const three = (): PickedFile[] => [
  { id: 'a', file: file('a.mp4') },
  { id: 'b', file: file('b.mp4') },
  { id: 'c', file: file('c.mp4') },
];

describe('SortableFileList', () => {
  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<Harness initial={three()} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('moves with the arrow buttons and announces the new position', () => {
    renderWithProviders(<Harness initial={three()} />);
    fireEvent.click(screen.getByRole('button', { name: 'c.mp4 nach oben' }));
    expect(screen.getByTestId('order')).toHaveTextContent('a.mp4,c.mp4,b.mp4');
    expect(screen.getByText('c.mp4 ist jetzt an Position 2 von 3.')).toHaveAttribute(
      'role',
      'status'
    );
  });

  it('keeps the edge buttons focusable instead of disabling them', () => {
    renderWithProviders(<Harness initial={three()} />);
    const up = screen.getByRole('button', { name: 'a.mp4 nach oben' });
    expect(up).toHaveAttribute('aria-disabled', 'true');
    expect(up).not.toBeDisabled();
    fireEvent.click(up);
    expect(screen.getByTestId('order')).toHaveTextContent('a.mp4,b.mp4,c.mp4');
  });

  it('puts the drag attributes on the handle, with a German role description', () => {
    renderWithProviders(<Harness initial={three()} />);
    const handle = screen.getByRole('button', { name: 'a.mp4 verschieben, Position 1 von 3' });
    expect(handle).toHaveAttribute('aria-roledescription', 'sortierbare Datei');
    const row = handle.closest('li')!;
    expect(row).not.toHaveAttribute('role');
    expect(within(row).getAllByRole('button')).toHaveLength(4);
  });

  it('moves focus to the next row after removing, and out when the list empties', async () => {
    const onLastRemoved = vi.fn();
    renderWithProviders(
      <Harness
        initial={[
          { id: 'a', file: file('a.mp4') },
          { id: 'b', file: file('b.mp4') },
        ]}
        onLastRemoved={onLastRemoved}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'a.mp4 entfernen' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'b.mp4 verschieben, Position 1 von 1' })
      ).toHaveFocus()
    );
    fireEvent.click(screen.getByRole('button', { name: 'b.mp4 entfernen' }));
    await waitFor(() => expect(onLastRemoved).toHaveBeenCalled());
  });
});
