// Die 768er-Grenze wird an drei Stellen gezogen: Tailwinds `md:`, die Regel in
// sidebar.css und `useIsMobile()`. Sie liefen auseinander — bei exakt 768px lag
// die Sidebar über dem Inhalt. Dieser Test hält die JS-Seite auf dem Komplement
// von `md:` fest; die CSS-Seite prüft nur eine Browsermessung.
import { useIsMobile } from '@gruenerator/ui';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

function Probe() {
  return <span data-testid="probe">{String(useIsMobile())}</span>;
}

function renderAt(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  render(<Probe />);
  return screen.getByTestId('probe').textContent;
}

describe('useIsMobile ist das Komplement von Tailwinds md:', () => {
  it('767px ist mobil', () => {
    expect(renderAt(767)).toBe('true');
  });

  it('768px ist bereits Desktop — `md:` greift ab 48rem einschließlich', () => {
    expect(renderAt(768)).toBe('false');
  });

  it('769px ist Desktop', () => {
    expect(renderAt(769)).toBe('false');
  });
});
