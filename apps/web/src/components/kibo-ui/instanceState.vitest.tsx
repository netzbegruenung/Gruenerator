import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CalendarProvider, useCalendarMonth } from './calendar';
import { GanttProvider, useGanttScrollX } from './gantt';

// These components used module-global jotai atoms, so state leaked between instances.

function MonthProbe({ id }: { id: string }) {
  const [month, setMonth] = useCalendarMonth();
  return (
    <button data-testid={id} onClick={() => setMonth(((month + 1) % 12) as typeof month)}>
      {month}
    </button>
  );
}

function ScrollProbe({ id }: { id: string }) {
  const [scrollX, setScrollX] = useGanttScrollX();
  return (
    <button data-testid={id} onClick={() => setScrollX(scrollX + 40)}>
      {scrollX}
    </button>
  );
}

describe('kibo-ui providers scope view state per instance', () => {
  it('calendar: month is seeded at mount and not shared', () => {
    render(
      <>
        <CalendarProvider>
          <MonthProbe id="a" />
        </CalendarProvider>
        <CalendarProvider>
          <MonthProbe id="b" />
        </CalendarProvider>
      </>
    );
    const current = String(new Date().getMonth());
    expect(screen.getByTestId('a').textContent).toBe(current);
    act(() => screen.getByTestId('a').click());
    expect(screen.getByTestId('a').textContent).not.toBe(current);
    expect(screen.getByTestId('b').textContent).toBe(current);
  });

  it('gantt: scrollX is not shared', () => {
    render(
      <>
        <GanttProvider>
          <ScrollProbe id="a" />
        </GanttProvider>
        <GanttProvider>
          <ScrollProbe id="b" />
        </GanttProvider>
      </>
    );
    act(() => screen.getByTestId('a').click());
    expect(screen.getByTestId('a').textContent).toBe('40');
    expect(screen.getByTestId('b').textContent).toBe('0');
  });
});
