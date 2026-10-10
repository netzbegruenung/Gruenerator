/**
 * „Eigene Farbe": übernimmt erst beim nativen `change` (ein Rückgängig-Schritt
 * je Wahl), zeigt eine eigene Farbe gefüllt und lässt die Vorgaben Vorgaben sein.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CustomColorSwatch } from '../CustomColorSwatch';

const PRESETS = ['#005538', '#FFFFFF'];

describe('CustomColorSwatch', () => {
  it('übernimmt beim change, schaut beim input nur vor', () => {
    const onPick = vi.fn();
    const onPreview = vi.fn();
    render(
      <CustomColorSwatch value="#005538" presets={PRESETS} onPick={onPick} onPreview={onPreview} />
    );
    const input = screen.getByLabelText('Eigene Farbe') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '#e6007e' } });
    expect(onPreview).toHaveBeenLastCalledWith('#E6007E');
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '#e6007e' } });
    expect(onPick).toHaveBeenLastCalledWith('#E6007E');
  });

  it('zeigt eine Farbe außerhalb der Vorgaben gefüllt, eine Vorgabe als Farbkreis', () => {
    const { rerender } = render(
      <CustomColorSwatch value="#e6007e" presets={PRESETS} onPick={() => {}} />
    );
    const swatch = screen.getByTitle('Eigene Farbe');
    expect(swatch.style.background).toMatch(/E6007E|230, 0, 126/i);
    expect(swatch.style.outline).not.toBe('none');

    rerender(<CustomColorSwatch value="#ffffff" presets={PRESETS} onPick={() => {}} />);
    expect(swatch.style.background).toContain('conic-gradient');
    expect(swatch.style.outline).toBe('none');
  });
});
