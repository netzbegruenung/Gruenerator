import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { useParteitagFilters } from './useParteitagFilters';

const wrap = (url: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  };

describe('useParteitagFilters', () => {
  it('reads known url values', () => {
    const { result } = renderHook(() => useParteitagFilters(), {
      wrapper: wrap(
        '/?bereich=kreis&platz=frauenplatz&thema=Klima&tag=2026-01-10&ergebnis=gewaehlt&kreis=05911'
      ),
    });
    expect(result.current[0]).toEqual({
      area: 'kreis',
      seatType: 'frauenplatz',
      topic: 'Klima',
      day: '2026-01-10',
      outcome: 'gewaehlt',
      kreis: '05911',
    });
  });
  it('unknown url values are ignored', () => {
    const { result } = renderHook(() => useParteitagFilters(), {
      wrapper: wrap('/?bereich=mars&platz=x&tag=gestern&ergebnis=boese'),
    });
    expect(result.current[0]).toEqual({
      area: null,
      seatType: null,
      topic: null,
      day: null,
      outcome: null,
      kreis: null,
    });
  });
});
