import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

const OPTIONS: SegmentedOption[] = [
  { value: 'oben', label: 'Text oben', short: 'Oben', disabled: false },
  { value: 'mitte', label: 'Text in der Mitte', short: 'Mitte', disabled: false },
  { value: 'unten', label: 'Text unten', short: 'Unten', disabled: true },
];

function renderControl(value: string | null, onChange = jest.fn()) {
  render(
    <SegmentedControl
      options={OPTIONS}
      value={value}
      onChange={onChange}
      accessibilityLabel="Position"
    />
  );
  return onChange;
}

describe('SegmentedControl', () => {
  it('shows the short labels and announces the long ones', () => {
    renderControl('oben');
    expect(screen.getByText('Oben')).toBeTruthy();
    expect(screen.getByText('Mitte')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Text in der Mitte' })).toBeTruthy();
    // The track is not `accessible` (that would fold the segments into one
    // element on iOS), so it is found by label rather than by role.
    expect(screen.getByLabelText('Position').props.accessibilityRole).toBe('radiogroup');
  });

  it('marks exactly the selected segment as checked', () => {
    renderControl('mitte');
    expect(screen.getByRole('radio', { name: 'Text in der Mitte' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Text oben' })).not.toBeChecked();
  });

  it('selects nothing for a null value', () => {
    renderControl(null);
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
  });

  it('reports the tapped value', () => {
    const onChange = renderControl('oben');
    fireEvent.press(screen.getByText('Mitte'));
    expect(onChange).toHaveBeenCalledWith('mitte');
  });

  it('does not press a disabled option', () => {
    const onChange = renderControl('oben');
    const disabled = screen.getByRole('radio', { name: 'Text unten' });
    expect(disabled).toBeDisabled();
    fireEvent.press(disabled);
    expect(onChange).not.toHaveBeenCalled();
  });
});
