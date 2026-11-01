// SPDX-License-Identifier: MPL-2.0
/**
 * Ein Klick auf einen Text zeigt die ganze Textleiste: Schrift UND Auszeichnung.
 * Ohne offene Sitzung gelten Fett, Kursiv, Akzent, Marker und Listen für den
 * GANZEN Text; im Editor (Doppelklick) bedienen dieselben Knöpfe die Auswahl.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  CanvasTextEditorProvider,
  preloadRichText,
} from '@ggraphic/editor/components/CanvasTextOverlay';
import { ContextControls } from '@ggraphic/editor/components/TopBar/ContextControls';
import { messages } from '@ggraphic/editor/i18n/messages';
import { CanvasStage, type CanvasStageRef } from '@ggraphic/editor/primitives/CanvasStage';
import { CanvasText } from '@ggraphic/editor/primitives/CanvasText';

import type { FloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';

const PT_SANS = 'PT Sans, Arial, sans-serif';
const DISPLAY_FONT = 'FixtureSans, Arial, sans-serif';

const base = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
};

const t = () => messages().textFormat;

function textModule(
  text: string | undefined,
  data: Partial<FloatingModuleState['data']> = {}
): FloatingModuleState {
  return {
    type: 'text',
    data: {
      id: 'free-1',
      isInstanceText: true,
      fontSize: 40,
      fontFamily: PT_SANS,
      ...(text !== undefined && { text }),
      ...data,
    },
  };
}

function controls(
  module: FloatingModuleState,
  handleTextFormatChange?: (id: string, text: string) => void
) {
  return (
    <ContextControls
      selectedElement={module.data.id}
      activeFloatingModule={module}
      canMoveUp={false}
      canMoveDown={false}
      canDuplicate={false}
      handlers={{ ...base, ...(handleTextFormatChange && { handleTextFormatChange }) }}
    />
  );
}

function show(module: FloatingModuleState) {
  const handleTextFormatChange = vi.fn();
  render(controls(module, handleTextFormatChange));
  return handleTextFormatChange;
}

const toolbar = () => screen.queryByRole('toolbar', { name: t().toolbar });
const button = (name: string) => screen.getByRole('button', { name });

describe('the format buttons of a text that is only selected', () => {
  it('shows the format toolbar of a free text, without an edit session', () => {
    show(textModule('Hallo Welt'));
    expect(toolbar()).toBeInTheDocument();
    for (const name of [t().bold, t().italic, t().underline, t().accent, t().marker]) {
      expect(button(name)).toBeInTheDocument();
    }
    expect(button(t().bulletList)).toBeInTheDocument();
    expect(button(t().orderedList)).toBeInTheDocument();
  });

  it('leaves a text of the template to the editor', () => {
    show(textModule('Hallo Welt', { id: 'headline', isInstanceText: false }));
    expect(toolbar()).toBeNull();
  });

  it('shows nothing for a text that cannot be edited, or without a handler', () => {
    show(textModule(undefined));
    expect(toolbar()).toBeNull();
  });

  it('shows nothing when the host has no handler', () => {
    render(controls(textModule('Hallo Welt')));
    expect(toolbar()).toBeNull();
  });

  it('offers bold and italic only where the font has the cuts', () => {
    show(textModule('Hallo Welt', { fontFamily: DISPLAY_FONT }));
    expect(screen.queryByRole('button', { name: t().bold })).toBeNull();
    expect(screen.queryByRole('button', { name: t().italic })).toBeNull();
    expect(button(t().underline)).toBeInTheDocument();
  });

  it('puts bold on the whole text with one click', () => {
    const onChange = show(textModule('Hallo Welt'));
    fireEvent.click(button(t().bold));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('free-1', '**Hallo Welt**');
  });

  it('puts italic and underline on the whole text', () => {
    const onChange = show(textModule('Hallo Welt'));
    fireEvent.click(button(t().italic));
    fireEvent.click(button(t().underline));
    expect(onChange).toHaveBeenNthCalledWith(1, 'free-1', '_Hallo Welt_');
    expect(onChange).toHaveBeenNthCalledWith(2, 'free-1', '<u>Hallo Welt</u>');
  });

  it('shows a button as pressed when the whole text carries it, and takes it off with the next click', () => {
    const onChange = show(textModule('**Hallo Welt**'));
    expect(button(t().bold)).toHaveAttribute('aria-pressed', 'true');
    expect(button(t().italic)).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button(t().bold));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('free-1', 'Hallo Welt');
  });

  it('is not pressed when only a part of the text carries it, and the click puts it on all', () => {
    const onChange = show(textModule('Hallo **Welt**'));
    expect(button(t().bold)).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button(t().bold));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('free-1', '**Hallo Welt**');
  });

  it('puts an accent in a colour of the palette on the whole text', () => {
    const onChange = show(textModule('Hallo Welt'));
    fireEvent.click(button(t().accent));
    const dialog = screen.getByRole('dialog', { name: t().colorOf(t().accent) });
    fireEvent.click(within(dialog).getAllByRole('button')[0]!);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(
      'free-1',
      expect.stringMatching(/^=={#[0-9A-F]{6}}Hallo Welt==$/)
    );
  });

  it('takes the accent off the whole text from its colour picker', () => {
    const onChange = show(textModule('=={#AA00CC}Hallo Welt=='));
    expect(button(t().accent)).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button(t().accent));
    fireEvent.click(screen.getByRole('button', { name: t().remove(t().accent) }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('free-1', 'Hallo Welt');
  });

  it('offers the colour of the template where the text has an accent style', () => {
    const onChange = show(textModule('Hallo Welt', { hasAccent: true }));
    fireEvent.click(button(t().accent));
    fireEvent.click(screen.getByRole('button', { name: t().templateColor }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('free-1', '==Hallo Welt==');
  });

  it('puts a marker on the whole text', () => {
    const onChange = show(textModule('Hallo Welt', { hasMarker: true }));
    fireEvent.click(button(t().marker));
    fireEvent.click(screen.getByRole('button', { name: t().templateColor }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('free-1', '++Hallo Welt++');
  });

  it('turns a text of several lines into a list and back', () => {
    const onChange = show(textModule('Eins\nZwei'));
    fireEvent.click(button(t().bulletList));
    expect(onChange).toHaveBeenLastCalledWith('free-1', '• Eins\n• Zwei');
    fireEvent.click(button(t().orderedList));
    expect(onChange).toHaveBeenLastCalledWith('free-1', '1. Eins\n2. Zwei');
  });

  it('shows the list the whole text is, and takes it off with the next click', () => {
    const onChange = show(textModule('• Eins\n• Zwei'));
    expect(button(t().bulletList)).toHaveAttribute('aria-pressed', 'true');
    expect(button(t().orderedList)).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button(t().bulletList));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('free-1', 'Eins\nZwei');
  });

  it('offers no numbered list for a text of one line', () => {
    show(textModule('Eins'));
    expect(button(t().orderedList)).toBeDisabled();
    expect(button(t().bulletList)).toBeEnabled();
  });

  it('reports nothing when a click changes nothing', () => {
    const onChange = show(textModule(''));
    fireEvent.click(button(t().bold));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the font role picker and the font size next to the buttons', () => {
    show(textModule('Hallo Welt'));
    expect(screen.getByLabelText(messages().topBar.fontLarger)).toBeInTheDocument();
  });
});

describe('the format buttons while the text is edited', () => {
  beforeAll(() => preloadRichText());

  function setup(text: string) {
    const handleTextFormatChange = vi.fn();
    const stageRef = createRef<CanvasStageRef>();
    render(
      <CanvasTextEditorProvider>
        {controls(textModule(text, { id: 'text-1' }), handleTextFormatChange)}
        <CanvasStage ref={stageRef} width={600} height={600}>
          <CanvasText
            id="text-1"
            x={10}
            y={10}
            width={400}
            fontSize={24}
            fontFamily={PT_SANS}
            text={text}
            editable
            onTextChange={() => {}}
          />
        </CanvasStage>
      </CanvasTextEditorProvider>
    );
    const open = () =>
      act(() => {
        stageRef.current?.getStage()?.findOne('#text-1')?.fire('dblclick');
      });
    return { handleTextFormatChange, open };
  }

  it('leaves the buttons to the editor while a session is open, and takes them back after it', () => {
    const { handleTextFormatChange, open } = setup('Hallo Welt');
    expect(screen.getAllByRole('toolbar', { name: t().toolbar })).toHaveLength(1);

    open();
    // One toolbar still, and now it serves the editor: a click does not write the whole text.
    expect(screen.getAllByRole('toolbar', { name: t().toolbar })).toHaveLength(1);
    fireEvent.click(button(t().bold));
    expect(handleTextFormatChange).not.toHaveBeenCalled();

    act(() => {
      fireEvent.keyDown(document.querySelector<HTMLElement>('.canvas-rte__content')!, {
        key: 'Escape',
      });
    });
    expect(document.querySelector('.canvas-rte__content')).toBeNull();
    expect(screen.getAllByRole('toolbar', { name: t().toolbar })).toHaveLength(1);
    fireEvent.click(button(t().bold));
    expect(handleTextFormatChange).toHaveBeenCalledExactlyOnceWith('text-1', '**Hallo Welt**');
  });
});
