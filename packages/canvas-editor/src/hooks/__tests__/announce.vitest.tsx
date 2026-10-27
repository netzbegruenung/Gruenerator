import {
  AnnouncerContext,
  useAnnounce,
  useLiveAnnouncer,
} from '@ggraphic/editor/hooks/useAnnounce';
import {
  SELECTION_ANNOUNCE_DELAY_MS,
  selectionMessage,
  useSelectionAnnouncement,
} from '@ggraphic/editor/hooks/useSelectionAnnouncement';
import { CanvasStoreProvider, useCanvasStore } from '@ggraphic/editor/stores/CanvasStoreProvider';
import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasAnnouncer } from '../../components/CanvasAnnouncer';
import { axe } from '../../test-utils';

import type { CanvasEditorStoreApi } from '@ggraphic/editor/stores/createCanvasEditorStore';

let announceFn: (text: string) => void = () => {};
let storeRef: CanvasEditorStoreApi;

function Harness({
  labels = {},
  active = true,
}: {
  labels?: Record<string, string>;
  active?: boolean;
}) {
  const { announcer, message } = useLiveAnnouncer();
  return (
    <AnnouncerContext.Provider value={announcer}>
      <CanvasAnnouncer message={message} />
      <CanvasStoreProvider>
        <Inner labels={labels} active={active} />
      </CanvasStoreProvider>
    </AnnouncerContext.Provider>
  );
}

function Inner({ labels, active }: { labels: Record<string, string>; active: boolean }) {
  const announce = useAnnounce();
  const store = useCanvasStore();
  useEffect(() => {
    announceFn = announce;
    storeRef = store;
  }, [announce, store]);
  useSelectionAnnouncement(store, (id) => labels[id] ?? null, active);
  return null;
}

const region = () => screen.getByRole('status');

describe('CanvasAnnouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ist eine leere, höfliche Live-Region und ohne Verstoß', async () => {
    vi.useRealTimers();
    const { container } = render(<Harness />);
    expect(region()).toHaveAttribute('aria-live', 'polite');
    expect(region()).toHaveAttribute('aria-atomic', 'true');
    expect(region()).toBeEmptyDOMElement();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('sagt an und sagt denselben Satz erneut an', () => {
    render(<Harness />);
    act(() => {
      announceFn('Rückgängig gemacht');
    });
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(region()).toHaveTextContent('Rückgängig gemacht');
    act(() => {
      announceFn('Rückgängig gemacht');
    });
    expect(region()).toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(region()).toHaveTextContent('Rückgängig gemacht');
  });
});

describe('Auswahl-Ansage', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const settle = () =>
    act(() => {
      vi.advanceTimersByTime(SELECTION_ANNOUNCE_DELAY_MS + 100);
    });

  it('formuliert Einzel-, Mehrfach- und leere Auswahl', () => {
    const labelOf = (id: string) => (id === 'a' ? 'Text: Klimaschutz' : null);
    expect(selectionMessage(['a'], labelOf)).toBe('Text: Klimaschutz ausgewählt');
    expect(selectionMessage(['a', 'b', 'c'], labelOf)).toBe('3 Elemente ausgewählt');
    expect(selectionMessage([], labelOf)).toBe('Auswahl aufgehoben');
  });

  it('sagt nur den Endzustand einer schnellen Folge an', () => {
    render(<Harness labels={{ a: 'Text: A', b: 'Text: B', c: 'Text: C' }} />);
    act(() => {
      storeRef.getState().setSelectedLayers(['a']);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      storeRef.getState().setSelectedLayers(['b']);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      storeRef.getState().setSelectedLayers(['c']);
    });
    settle();
    expect(region()).toHaveTextContent('Text: C ausgewählt');
  });

  it('schweigt auf einer inaktiven Seite', () => {
    render(<Harness labels={{ a: 'Text: A' }} active={false} />);
    act(() => {
      storeRef.getState().setSelectedLayers(['a']);
    });
    settle();
    act(() => {
      storeRef.getState().deselectAll();
    });
    settle();
    expect(region()).toBeEmptyDOMElement();
  });

  it('sagt „Auswahl aufgehoben“ nur nach einer Auswahl', () => {
    render(<Harness labels={{ a: 'Text: A' }} />);
    act(() => {
      storeRef.getState().deselectAll();
    });
    settle();
    expect(region()).toBeEmptyDOMElement();
    act(() => {
      storeRef.getState().setSelectedLayers(['a']);
    });
    settle();
    act(() => {
      storeRef.getState().deselectAll();
    });
    settle();
    expect(region()).toHaveTextContent('Auswahl aufgehoben');
  });

  it('weicht einer Ansage, die dazwischen kam', () => {
    render(<Harness labels={{ a: 'Text: A' }} />);
    act(() => {
      storeRef.getState().setSelectedLayers(['a']);
    });
    act(() => {
      announceFn('Gelöscht: Text: A');
    });
    settle();
    expect(region()).toHaveTextContent('Gelöscht: Text: A');
  });

  it('schweigt, solange der Fokus in der Ebenen-Liste liegt', () => {
    render(
      <>
        <div role="listbox" aria-label="Ebenen">
          <div role="option" aria-selected="false" tabIndex={0} data-testid="opt">
            Text: A
          </div>
        </div>
        <Harness labels={{ a: 'Text: A' }} />
      </>
    );
    screen.getByTestId('opt').focus();
    act(() => {
      storeRef.getState().setSelectedLayers(['a']);
    });
    settle();
    expect(screen.getAllByRole('status')[0]).toBeEmptyDOMElement();
  });
});

describe('Rückgängig und Wiederherstellen', () => {
  it('sagen an, was sie getan haben — und schweigen ohne Schritt', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { useCanvasUndoRedo } = await import('@ggraphic/editor/hooks/useCanvasUndoRedo');
    const announce = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnnouncerContext.Provider value={{ announce, lastAnnouncedAt: { current: 0 } }}>
        <CanvasStoreProvider>{children}</CanvasStoreProvider>
      </AnnouncerContext.Provider>
    );
    const { result } = renderHook(() => useCanvasUndoRedo(250, undefined, false), { wrapper });
    act(() => {
      result.current.undo();
    });
    expect(announce).not.toHaveBeenCalled();
    act(() => {
      result.current.saveNow({ a: 1 });
    });
    act(() => {
      result.current.saveNow({ a: 2 });
    });
    act(() => {
      result.current.undo();
    });
    expect(announce).toHaveBeenLastCalledWith('Rückgängig gemacht');
    act(() => {
      result.current.redo();
    });
    expect(announce).toHaveBeenLastCalledWith('Wiederhergestellt');
  });
});
