/**
 * „Leere Seite" im Seiten-Picker legt eine leere Seite an: in der Marke des
 * Decks, aber ohne Foto und Farbe der aktuellen Seite (#5256). „Vorlage
 * ändern" bleibt beim Umwandeln der Seite.
 */
import { type EditorPagePickerProps, type EditorShellExtensions } from '@ggraphic/editor/shell';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import '../grueneratorEditorShell';

const registered = vi.hoisted(() => ({ shell: null as EditorShellExtensions | null }));

vi.mock('@ggraphic/editor/shell', async (importOriginal) => {
  const actual = await importOriginal<{
    registerEditorShell: (extensions: EditorShellExtensions) => void;
  }>();
  return {
    ...actual,
    registerEditorShell: (extensions: EditorShellExtensions) => {
      registered.shell = extensions;
      actual.registerEditorShell(extensions);
    },
  };
});

const renderPicker = (props: Partial<EditorPagePickerProps>) => {
  const Picker = registered.shell?.pagePicker?.Picker;
  if (!Picker) throw new Error('the Grünerator shell registered no page picker');
  render(
    <Picker
      isOpen
      onClose={vi.fn()}
      mode="add"
      currentTemplateId="freeform"
      activeTemplateId="freeform"
      pages={[{ id: 'p1', configId: 'freeform', state: {} }]}
      formatId="post-portrait"
      onSelectTemplate={vi.fn()}
      {...props}
    />
  );
};

describe('Grünerator page picker: Leere Seite', () => {
  it('adds a blank page with the brand but without the current background', () => {
    const addPage = vi.fn(async () => {});
    const onSelectTemplate = vi.fn();
    renderPicker({ addPage, onSelectTemplate });

    fireEvent.click(screen.getByRole('button', { name: /Leere Seite/ }));

    expect(addPage).toHaveBeenCalledWith('freeform', { brand: true, background: false });
    expect(onSelectTemplate).not.toHaveBeenCalled();
  });

  it('converts the page in replace mode', () => {
    const onSelectTemplate = vi.fn();
    renderPicker({ mode: 'replace', onSelectTemplate });

    fireEvent.click(screen.getByRole('button', { name: /Leere Seite/ }));

    expect(onSelectTemplate).toHaveBeenCalledWith('freeform');
  });
});
