import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import SelectAllCheckbox from './SelectAllCheckbox';

describe('SelectAllCheckbox', () => {
  it('renders nothing when not enabled', () => {
    const { container } = render(<SelectAllCheckbox enabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when disabled while a remote source is active', () => {
    const { container } = render(
      <SelectAllCheckbox enabled disabledWhenRemote isRemoteActive filteredItems={[{}]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there are no selectable items', () => {
    const { container } = render(<SelectAllCheckbox enabled filteredItems={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('excludes wolke-sourced documents from the selectable count (unchecked when none of the rest are selected)', () => {
    render(
      <SelectAllCheckbox
        enabled
        itemType="document"
        filteredItems={[{ source_type: 'wolke' }, { source_type: 'upload' }]}
        selectedItemIds={new Set(['upload-id'])}
        onToggleAll={vi.fn()}
      />
    );
    // 1 selected out of 1 selectable (wolke item excluded) => fully checked, not indeterminate
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(checkbox.indeterminate).toBe(false);
  });

  it('sets the indeterminate DOM property when some but not all items are selected', () => {
    render(
      <SelectAllCheckbox
        enabled
        filteredItems={[{ id: '1' }, { id: '2' }, { id: '3' }]}
        selectedItemIds={new Set(['1'])}
        onToggleAll={vi.fn()}
      />
    );
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.indeterminate).toBe(true);
  });

  it('calls onToggleAll with the new checked value on click', async () => {
    const onToggleAll = vi.fn();
    render(
      <SelectAllCheckbox
        enabled
        filteredItems={[{ id: '1' }]}
        selectedItemIds={new Set()}
        onToggleAll={onToggleAll}
      />
    );
    await userEvent.setup().click(screen.getByRole('checkbox'));
    expect(onToggleAll).toHaveBeenCalledWith(true);
  });
});
