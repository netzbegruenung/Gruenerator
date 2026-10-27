// SPDX-License-Identifier: MPL-2.0
/**
 * Die Werkzeugleiste des Sharepic-Text-Editors: was sie je Schrift anbietet
 * und was ihre Knöpfe in den flachen Feldtext schreiben.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { RichTextField } from '@ggraphic/editor/components/RichTextField';
import { TextFormatControls } from '@ggraphic/editor/components/TextFormatControls';
import { fontMarkSupport } from '@ggraphic/editor/utils/fontMarkSupport';

import { axe } from '../../test-utils';

import type { Editor } from '@tiptap/react';

/**
 * Auswahl über den gesamten Text setzen. ProseMirror liest die DOM-Auswahl
 * nur, wenn die Fläche den Fokus hat — ohne das vorherige `focus()` zieht
 * `chain().focus()` die gespeicherte (leere) Auswahl zurück an den Anfang,
 * und `toggleBold` schriebe bloß einen gespeicherten Mark ohne Wirkung.
 */
function selectAll(container: HTMLElement) {
  const content = container.querySelector<HTMLElement>('.canvas-rte__content');
  if (!content) throw new Error('kein contenteditable gerendert');
  content.focus();
  const range = document.createRange();
  range.selectNodeContents(content);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  return content;
}

const PT_SANS = 'PT Sans, Arial, sans-serif';
const BRAND_TYPE = 'FixtureSans, Arial, sans-serif';

describe('RichTextField', () => {
  it('bietet auf PT Sans Fett, Kursiv, Unterstrichen und beide Listen', () => {
    render(<RichTextField value="Hallo" onChange={() => {}} marks={fontMarkSupport(PT_SANS)} />);

    expect(screen.getByRole('toolbar', { name: 'Textformatierung' })).toBeInTheDocument();
    for (const label of [/Fett/, /Kursiv/, /Unterstrichen/, /^Aufzählung$/, /Nummerierte/]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('lässt auf einer Schrift ohne echte Schnitte Fett und Kursiv weg, Listen und Unterstrichen bleiben', () => {
    render(<RichTextField value="Hallo" onChange={() => {}} marks={fontMarkSupport(BRAND_TYPE)} />);

    expect(screen.queryByRole('button', { name: /Fett/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kursiv/ })).not.toBeInTheDocument();
    // Unterstreichung wird gezeichnet, nicht gesetzt — sie gilt überall.
    expect(screen.getByRole('button', { name: /Unterstrichen/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Aufzählung$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nummerierte/ })).toBeInTheDocument();
  });

  it('Fett auf der Auswahl schreibt **…** in den Feldtext', () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichTextField value="Hallo Welt" onChange={onChange} marks={fontMarkSupport(PT_SANS)} />
    );

    selectAll(container);
    screen.getByRole('button', { name: /Fett/ }).click();

    expect(onChange).toHaveBeenCalledWith('**Hallo Welt**');
  });

  it('Unterstrichen schreibt <u>…</u> — auch ohne echte Schnitte', () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichTextField value="Hallo Welt" onChange={onChange} marks={fontMarkSupport(BRAND_TYPE)} />
    );

    selectAll(container);
    screen.getByRole('button', { name: /Unterstrichen/ }).click();

    expect(onChange).toHaveBeenCalledWith('<u>Hallo Welt</u>');
  });

  it('Aufzählung schreibt den Marker — auf jeder Schrift', () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichTextField value="Erster Punkt" onChange={onChange} marks={fontMarkSupport(BRAND_TYPE)} />
    );

    selectAll(container);
    screen.getByRole('button', { name: /^Aufzählung$/ }).click();

    expect(onChange).toHaveBeenCalledWith('• Erster Punkt');
  });

  it('Enter in der Liste und ein getipptes „• x" geben genau eine Kugel (#4275)', () => {
    const onChange = vi.fn();
    let editor: Editor | null = null;
    render(
      <RichTextField
        value="• Bus"
        onChange={onChange}
        marks={fontMarkSupport(PT_SANS)}
        onEditorReady={(e) => {
          editor = e;
        }}
      />
    );

    const live = editor as Editor | null;
    if (!live) throw new Error('kein Editor');
    act(() => {
      live.commands.focus('end');
      live.commands.keyboardShortcut('Enter');
      live.commands.insertContent('• Radwege bauen');
    });

    expect(onChange).toHaveBeenLastCalledWith('• Bus\n• Radwege bauen');
  });

  it('ein Feld ohne echte Schnitte kann getippte **…** nicht selbst erzeugen, zeigt sie aber', () => {
    // Das Schema MUSS bold/italic kennen, auch wo die Schrift sie nicht
    // trägt — sonst wirft ProseMirror und tiptap setzt ein leeres Dokument.
    const { container } = render(
      <RichTextField
        value="ganz **wichtig**"
        onChange={() => {}}
        marks={fontMarkSupport(BRAND_TYPE)}
      />
    );

    expect(container.querySelector('.canvas-rte__content strong')).toHaveTextContent('wichtig');
  });

  it('lässt die Werkzeugleiste weg, wenn ein Wirt sie zeigt', () => {
    // Im Editor trägt die Kontextleiste der Kopfleiste die Knöpfe; stünden
    // sie zusätzlich über dem Text, gäbe es zwei Leisten für eine Handlung.
    const { container } = render(
      <RichTextField
        value="Hallo"
        onChange={() => {}}
        marks={fontMarkSupport(PT_SANS)}
        showToolbar={false}
      />
    );

    expect(screen.queryByRole('toolbar', { name: 'Textformatierung' })).not.toBeInTheDocument();
    expect(container.querySelector('.canvas-rte__floating-toolbar')).toBeNull();
    // Der Editor selbst bleibt unberührt.
    expect(container.querySelector('.canvas-rte__content')).not.toBeNull();
  });

  it('reicht den lebenden Editor nach oben und meldet sein Abräumen', () => {
    const onEditorReady = vi.fn();
    const { unmount } = render(
      <RichTextField
        value="Hallo"
        onChange={() => {}}
        marks={fontMarkSupport(PT_SANS)}
        onEditorReady={onEditorReady}
      />
    );

    expect(onEditorReady).toHaveBeenCalledWith(
      expect.objectContaining({ commands: expect.anything() })
    );

    // Ohne das `null` bediente der Wirt nach dem Schließen eine Leiche.
    onEditorReady.mockClear();
    unmount();
    expect(onEditorReady).toHaveBeenCalledWith(null);
  });

  it('Auszeichnung aus dem Feldtext kommt als Auszeichnung im Editor an', () => {
    const { container } = render(
      <RichTextField
        value={'**fett** _kursiv_ <u>unter</u>\n• Punkt'}
        onChange={() => {}}
        marks={fontMarkSupport(PT_SANS)}
      />
    );

    const content = container.querySelector('.canvas-rte__content')!;
    expect(content.querySelector('strong')).toHaveTextContent('fett');
    expect(content.querySelector('em')).toHaveTextContent('kursiv');
    expect(content.querySelector('u')).toHaveTextContent('unter');
    expect(content.querySelector('ul li')).toHaveTextContent('Punkt');
  });
});

describe('RichTextField: Fokus beim Öffnen', () => {
  it('wählt den ganzen Text aus, wie die Textarea davor', () => {
    const onChange = vi.fn();
    render(
      <RichTextField
        value="Alter Text"
        onChange={onChange}
        marks={fontMarkSupport(PT_SANS)}
        autoFocus
      />
    );

    // Ohne Auswahl bliebe der alte Text stehen und das Getippte hinge an —
    // auf der Leinwand ersetzt ein Doppelklick plus Tippen das Feld.
    screen.getByRole('button', { name: /Fett/ }).click();

    expect(onChange).toHaveBeenCalledWith('**Alter Text**');
  });

  it('Enter auf der Startauswahl über mehrere Listenpunkte wirft nicht (#4287)', () => {
    // tiptap ≤ 3.31.3 prüfte in `splitBlock` `canSplit` vor dem Löschen der
    // Auswahl; die Löschung räumte die ganze Liste ab und `split` warf
    // „Inserted content deeper than insertion position".
    let editor: Editor | null = null;
    render(
      <RichTextField
        value={'• eins\n• zwei\n• drei'}
        onChange={() => {}}
        marks={fontMarkSupport(PT_SANS)}
        onEditorReady={(e) => {
          editor = e;
        }}
        autoFocus
      />
    );

    const live = editor as Editor | null;
    if (!live) throw new Error('kein Editor');
    // Über die Keymap wie ein echter Tastendruck, nicht über
    // `keyboardShortcut`: dessen Transaktions-Mitschnitt verhält sich anders.
    const enter = new KeyboardEvent('keydown', { key: 'Enter' });
    expect(() =>
      act(() => {
        live.view.someProp('handleKeyDown', (handle) => handle(live.view, enter));
      })
    ).not.toThrow();
    expect(() => live.state.doc.check()).not.toThrow();
  });

  it('behält Akzent und Marker samt Farbe beim Laden und bietet beide überall an', () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichTextField
        value="=={#E6007E}Das== ist ++{#FFFFFF}ungerecht.++"
        onChange={onChange}
        marks={fontMarkSupport(PT_SANS)}
      />
    );
    const accent = container.querySelector('mark[data-accent]');
    expect(accent?.textContent).toBe('Das');
    expect(accent?.getAttribute('data-color')).toBe('#E6007E');
    const marker = container.querySelector('mark[data-marker]');
    expect(marker?.getAttribute('data-color')).toBe('#FFFFFF');
    expect(marker?.getAttribute('style')).toContain('--mark-ink: #1D3557');
    expect(screen.getByRole('button', { name: 'Akzent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Textmarker' })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Akzent-Farbe auf der Auswahl schreibt =={#…}…== in den Feldtext', () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichTextField value="Hallo" onChange={onChange} marks={fontMarkSupport(PT_SANS)} />
    );
    selectAll(container);
    act(() => screen.getByRole('button', { name: 'Akzent' }).click());
    act(() => screen.getByRole('button', { name: 'Ocean' }).click());
    expect(onChange).toHaveBeenLastCalledWith('=={#457B9D}Hallo==');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Vorlagenfarbe gibt es nur, wo der Text einen Stil hat, und schreibt ++…++ ohne Farbe', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <RichTextField value="Hallo" onChange={onChange} marks={fontMarkSupport(PT_SANS)} />
    );
    act(() => screen.getByRole('button', { name: 'Textmarker' }).click());
    expect(screen.queryByRole('button', { name: 'Vorlagenfarbe' })).not.toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'Textmarker' }).click());

    rerender(
      <RichTextField
        value="Hallo"
        onChange={onChange}
        marks={{ ...fontMarkSupport(PT_SANS), marker: true }}
      />
    );
    selectAll(container);
    act(() => screen.getByRole('button', { name: 'Textmarker' }).click());
    act(() => screen.getByRole('button', { name: 'Vorlagenfarbe' }).click());
    expect(onChange).toHaveBeenLastCalledWith('++Hallo++');
  });

  it('entfernt den Textmarker wieder', () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichTextField
        value="++{#9EE493}Hallo++"
        onChange={onChange}
        marks={fontMarkSupport(PT_SANS)}
      />
    );
    selectAll(container);
    act(() => screen.getByRole('button', { name: 'Textmarker' }).click());
    act(() => screen.getByRole('button', { name: 'Textmarker entfernen' }).click());
    expect(onChange).toHaveBeenLastCalledWith('Hallo');
  });
});

describe('RichTextField: die Werkzeugleiste per Tastatur', () => {
  function content(container: HTMLElement) {
    return container.querySelector<HTMLElement>('.canvas-rte__content')!;
  }

  it('Tab im Text geht in die Leiste, ohne den Editor zu schliessen', async () => {
    const onBlur = vi.fn();
    const { container } = render(
      <RichTextField
        value="Hallo"
        onChange={() => {}}
        marks={fontMarkSupport(PT_SANS)}
        onBlur={onBlur}
      />
    );
    const field = content(container);
    field.focus();
    fireEvent.keyDown(field, { key: 'Tab' });
    const toolbar = screen.getByRole('toolbar', { name: 'Textformatierung' });
    expect(toolbar).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole('button', { name: /Fett/ })).toHaveFocus();
    expect(onBlur).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Tab erreicht auch die Leiste eines Wirts (Kontextleiste)', () => {
    function Host() {
      const [editor, setEditor] = useState<Editor | null>(null);
      return (
        <>
          <div data-testid="kontextleiste">
            {editor && (
              <TextFormatControls
                editor={editor}
                marks={fontMarkSupport(PT_SANS)}
                variant="contextBar"
              />
            )}
          </div>
          <RichTextField
            value="Hallo"
            onChange={() => {}}
            marks={fontMarkSupport(PT_SANS)}
            showToolbar={false}
            onEditorReady={setEditor}
          />
        </>
      );
    }
    const { container } = render(<Host />);
    const field = content(container);
    field.focus();
    fireEvent.keyDown(field, { key: 'Tab' });
    expect(screen.getByRole('button', { name: /Fett/ })).toHaveFocus();
    expect(screen.getByTestId('kontextleiste')).toContainElement(
      document.activeElement as HTMLElement
    );
  });

  it('Escape in der Leiste schliesst ab und erreicht die Tastatur der Seite nicht', () => {
    const onEscape = vi.fn();
    const onWindowKey = vi.fn();
    const { container } = render(
      <RichTextField
        value="Hallo"
        onChange={() => {}}
        marks={fontMarkSupport(PT_SANS)}
        onEscape={onEscape}
      />
    );
    const field = content(container);
    field.focus();
    fireEvent.keyDown(field, { key: 'Tab' });
    window.addEventListener('keydown', onWindowKey);
    fireEvent.keyDown(screen.getByRole('button', { name: /Fett/ }), { key: 'Escape' });
    window.removeEventListener('keydown', onWindowKey);
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onWindowKey).not.toHaveBeenCalled();
  });

  it('verlässt der Fokus die Leiste, schliesst der Editor ab', () => {
    const onBlur = vi.fn();
    const { container } = render(
      <>
        <RichTextField
          value="Hallo"
          onChange={() => {}}
          marks={fontMarkSupport(PT_SANS)}
          onBlur={onBlur}
        />
        <button type="button">Woanders</button>
      </>
    );
    const field = content(container);
    field.focus();
    fireEvent.keyDown(field, { key: 'Tab' });
    expect(onBlur).not.toHaveBeenCalled();
    screen.getByRole('button', { name: 'Woanders' }).focus();
    expect(onBlur).toHaveBeenCalled();
  });

  it('zurück in den Text bleibt der Editor offen', () => {
    const onBlur = vi.fn();
    const { container } = render(
      <RichTextField
        value="Hallo"
        onChange={() => {}}
        marks={fontMarkSupport(PT_SANS)}
        onBlur={onBlur}
      />
    );
    const field = content(container);
    field.focus();
    fireEvent.keyDown(field, { key: 'Tab' });
    field.focus();
    expect(onBlur).not.toHaveBeenCalled();
  });
});
