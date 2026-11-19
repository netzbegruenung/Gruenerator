import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useEditorStore } from '../stores/editorStore';

import { useFieldRegistry } from './useFieldRegistry';

function Fields() {
  const { registerField } = useFieldRegistry();
  return (
    <>
      <input aria-label="Titel 1" ref={(el) => registerField('sections.themes.0.title', el)} />
      <input aria-label="Titel 2" ref={(el) => registerField('sections.themes.1.title', el)} />
      <textarea
        aria-label="Inhalt 2"
        ref={(el) => registerField('sections.themes.1.content', el)}
      />
    </>
  );
}

let registerLate: (path: string, el: HTMLElement | null) => void = () => {};
function Late() {
  registerLate = useFieldRegistry().registerField;
  return null;
}

describe('useFieldRegistry', () => {
  it('focusing sections.themes.1 focuses the registered sections.themes.1.title', () => {
    render(<Fields />);
    act(() => useEditorStore.getState().focusPath('themes', 'sections.themes.1'));
    expect(screen.getByLabelText('Titel 2')).toHaveFocus();
  });

  it('focuses the exact field when it is registered', () => {
    render(<Fields />);
    act(() => useEditorStore.getState().focusPath('themes', 'sections.themes.1.content'));
    expect(screen.getByLabelText('Inhalt 2')).toHaveFocus();
  });

  it('focuses a field that registers after the request was made', () => {
    act(() => useEditorStore.getState().focusPath('legal', 'legal.name'));
    render(<Late />);
    render(<input aria-label="Name" ref={(el) => registerLate('legal.name', el)} />);
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });
});
