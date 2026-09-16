/**
 * Die Werkzeugleiste des Sharepic-Text-Editors: was sie je Schrift anbietet
 * und was ihre Knöpfe in den flachen Feldtext schreiben.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { fontMarkSupport } from '../../utils/fontMarkSupport';
import { RichTextField } from '../RichTextField';

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
const GRUENE_TYPE = 'GrueneTypeNeue, Arial, sans-serif';

describe('RichTextField', () => {
  it('bietet auf PT Sans Fett, Kursiv, Unterstrichen und beide Listen', () => {
    render(<RichTextField value="Hallo" onChange={() => {}} marks={fontMarkSupport(PT_SANS)} />);

    expect(screen.getByRole('toolbar', { name: 'Textformatierung' })).toBeInTheDocument();
    for (const label of [/Fett/, /Kursiv/, /Unterstrichen/, /^Aufzählung$/, /Nummerierte/]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('lässt auf einer Schrift ohne echte Schnitte Fett und Kursiv weg, Listen und Unterstrichen bleiben', () => {
    render(
      <RichTextField value="Hallo" onChange={() => {}} marks={fontMarkSupport(GRUENE_TYPE)} />
    );

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
      <RichTextField value="Hallo Welt" onChange={onChange} marks={fontMarkSupport(GRUENE_TYPE)} />
    );

    selectAll(container);
    screen.getByRole('button', { name: /Unterstrichen/ }).click();

    expect(onChange).toHaveBeenCalledWith('<u>Hallo Welt</u>');
  });

  it('Aufzählung schreibt den Marker — auf jeder Schrift', () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichTextField
        value="Erster Punkt"
        onChange={onChange}
        marks={fontMarkSupport(GRUENE_TYPE)}
      />
    );

    selectAll(container);
    screen.getByRole('button', { name: /^Aufzählung$/ }).click();

    expect(onChange).toHaveBeenCalledWith('• Erster Punkt');
  });

  it('ein Feld ohne echte Schnitte kann getippte **…** nicht selbst erzeugen, zeigt sie aber', () => {
    // Das Schema MUSS bold/italic kennen, auch wo die Schrift sie nicht
    // trägt — sonst wirft ProseMirror und tiptap setzt ein leeres Dokument.
    const { container } = render(
      <RichTextField
        value="ganz **wichtig**"
        onChange={() => {}}
        marks={fontMarkSupport(GRUENE_TYPE)}
      />
    );

    expect(container.querySelector('.canvas-rte__content strong')).toHaveTextContent('wichtig');
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
});
