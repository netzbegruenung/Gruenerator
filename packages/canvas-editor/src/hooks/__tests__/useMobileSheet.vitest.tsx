import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarPanel } from '../../sidebar/SidebarPanel';

function setMobileViewport() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('max-width: 899px'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function renderSheet(onClose: () => void) {
  render(
    <SidebarPanel isOpen title="Text" onClose={onClose}>
      <p>Inhalt</p>
    </SidebarPanel>
  );
  const sheet = screen.getByRole('region', { name: 'Text' });
  const handle = sheet.querySelector('.sidebar-panel__drag-handle') as HTMLElement;
  return { sheet, handle };
}

describe('useMobileSheet', () => {
  beforeEach(setMobileViewport);

  it('zieht das Sheet ohne Render mit und federt unter der Schwelle zurück', () => {
    const onClose = vi.fn();
    const { sheet, handle } = renderSheet(onClose);
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);

    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 150 }] });
    expect(sheet.style.transform).toBe('translateY(50px)');

    now.mockReturnValue(1000);
    fireEvent.touchEnd(handle, { touches: [] });
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('');
    expect(sheet.style.transition).toContain('transform 200ms');
    now.mockRestore();
  });

  it('schließt über der Schwelle', () => {
    const onClose = vi.fn();
    const { handle } = renderSheet(onClose);
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);

    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 260 }] });
    now.mockReturnValue(1000);
    fireEvent.touchEnd(handle, { touches: [] });
    expect(onClose).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it('ignoriert Berührungen außerhalb des Griffs', () => {
    const onClose = vi.fn();
    const { sheet } = renderSheet(onClose);
    const content = screen.getByText('Inhalt');

    fireEvent.touchStart(content, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(content, { touches: [{ clientY: 400 }] });
    fireEvent.touchEnd(content, { touches: [] });
    expect(sheet.style.transform).toBe('');
    expect(onClose).not.toHaveBeenCalled();
  });
});
