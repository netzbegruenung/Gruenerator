// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import {
  setWholeTextList,
  setWholeTextMark,
  wholeTextCanOrderedList,
  wholeTextFormat,
} from './wholeTextFormat.js';

describe('setWholeTextMark: one mark over the whole text', () => {
  it('puts each mark on a plain text, in the stored markdown-lite form', () => {
    expect(setWholeTextMark('Hallo Welt', 'bold', true)).toBe('**Hallo Welt**');
    expect(setWholeTextMark('Hallo Welt', 'italic', true)).toBe('_Hallo Welt_');
    expect(setWholeTextMark('Hallo Welt', 'underline', true)).toBe('<u>Hallo Welt</u>');
    expect(setWholeTextMark('Hallo Welt', 'accent', true)).toBe('==Hallo Welt==');
    expect(setWholeTextMark('Hallo Welt', 'marker', true)).toBe('++Hallo Welt++');
  });

  it('carries the colour of an accent or a marker', () => {
    expect(setWholeTextMark('Hallo Welt', 'accent', true, '#AA00CC')).toBe(
      '=={#AA00CC}Hallo Welt=='
    );
    expect(setWholeTextMark('Hallo Welt', 'marker', true, '#ffffff')).toBe(
      '++{#FFFFFF}Hallo Welt++'
    );
  });

  it('takes a colour that is no #RRGGBB for the colour of the template', () => {
    expect(setWholeTextMark('Hallo Welt', 'accent', true, 'red')).toBe('==Hallo Welt==');
  });

  it('removes a mark from the whole text', () => {
    expect(setWholeTextMark('**Hallo Welt**', 'bold', false)).toBe('Hallo Welt');
    expect(setWholeTextMark('=={#AA00CC}Hallo Welt==', 'accent', false)).toBe('Hallo Welt');
  });

  it('applies to all of a text that has the mark only in part', () => {
    expect(setWholeTextMark('Hallo **Welt**', 'bold', true)).toBe('**Hallo Welt**');
  });

  it('removes the mark from the parts that carry it', () => {
    expect(setWholeTextMark('Hallo **Welt**', 'bold', false)).toBe('Hallo Welt');
  });

  it('puts a new colour over the colours the parts had', () => {
    expect(setWholeTextMark('=={#FFFFFF}Hallo== Welt', 'accent', true, '#000000')).toBe(
      '=={#000000}Hallo Welt=='
    );
  });

  it('leaves the other marks where they are', () => {
    expect(setWholeTextMark('_Hallo_ Welt', 'bold', true)).toBe('**_Hallo_ Welt**');
    expect(setWholeTextMark('**_Hallo Welt_**', 'bold', false)).toBe('_Hallo Welt_');
  });

  it('marks every line of a text with several lines', () => {
    expect(setWholeTextMark('Eins\nZwei', 'bold', true)).toBe('**Eins**\n**Zwei**');
  });

  it('keeps the blanks at the edges outside the mark and the empty lines empty', () => {
    expect(setWholeTextMark('  Hallo  \n\nWelt', 'bold', true)).toBe('  **Hallo**  \n\n**Welt**');
  });

  it('leaves the marker of a list item in front of the mark', () => {
    expect(setWholeTextMark('• Eins\n• Zwei', 'bold', true)).toBe('• **Eins**\n• **Zwei**');
    expect(setWholeTextMark('1. Eins\n2. Zwei', 'italic', true)).toBe('1. _Eins_\n2. _Zwei_');
  });

  it('leaves an empty text alone', () => {
    expect(setWholeTextMark('', 'bold', true)).toBe('');
    expect(setWholeTextMark('  \n', 'bold', true)).toBe('  \n');
  });
});

describe('wholeTextFormat: what the whole text carries', () => {
  it('is all off for a plain text and for an empty one', () => {
    expect(wholeTextFormat('Hallo Welt')).toEqual({
      bold: false,
      italic: false,
      underline: false,
      accent: false,
      accentColor: null,
      marker: false,
      markerColor: null,
      bulletList: false,
      orderedList: false,
    });
    expect(wholeTextFormat('').bold).toBe(false);
    expect(wholeTextFormat('  ').bold).toBe(false);
  });

  it('is on only where every word carries the mark', () => {
    expect(wholeTextFormat('**Hallo Welt**').bold).toBe(true);
    expect(wholeTextFormat('Hallo **Welt**').bold).toBe(false);
    expect(wholeTextFormat('**Eins**\n**Zwei**').bold).toBe(true);
    expect(wholeTextFormat('**Eins**\nZwei').bold).toBe(false);
  });

  it('does not count the blank between two marked words as unmarked', () => {
    expect(wholeTextFormat('**Hallo** **Welt**').bold).toBe(true);
  });

  it('reads the other marks the same way', () => {
    const f = wholeTextFormat('<u>_Hallo Welt_</u>');
    expect(f.underline).toBe(true);
    expect(f.italic).toBe(true);
    expect(f.bold).toBe(false);
  });

  it('names the colour of an accent or a marker that runs over the whole text', () => {
    const accent = wholeTextFormat('=={#AA00CC}Hallo== =={#AA00CC}Welt==');
    expect(accent.accent).toBe(true);
    expect(accent.accentColor).toBe('#AA00CC');
    const marker = wholeTextFormat('++{#FFFFFF}Hallo Welt++');
    expect(marker.marker).toBe(true);
    expect(marker.markerColor).toBe('#FFFFFF');
  });

  it('names no colour for the colour of the template or for two colours', () => {
    expect(wholeTextFormat('==Hallo Welt==').accentColor).toBeNull();
    const two = wholeTextFormat('=={#AA00CC}Hallo== =={#FFFFFF}Welt==');
    expect(two.accent).toBe(true);
    expect(two.accentColor).toBeNull();
  });

  it('sees the marks inside the items of a list', () => {
    expect(wholeTextFormat('• **Eins**\n• **Zwei**').bold).toBe(true);
    expect(wholeTextFormat('• **Eins**\n• Zwei').bold).toBe(false);
  });

  it('follows a mark it has set', () => {
    const marked = setWholeTextMark('Eins\nZwei', 'accent', true, '#AA00CC');
    expect(wholeTextFormat(marked).accentColor).toBe('#AA00CC');
    expect(wholeTextFormat(setWholeTextMark(marked, 'accent', false)).accent).toBe(false);
  });
});

describe('setWholeTextList: a list over the whole text', () => {
  it('turns every line of a text into a bullet', () => {
    expect(setWholeTextList('Eins\nZwei', 'bullet')).toBe('• Eins\n• Zwei');
  });

  it('turns every line into a numbered item', () => {
    expect(setWholeTextList('Eins\nZwei\nDrei', 'ordered')).toBe('1. Eins\n2. Zwei\n3. Drei');
  });

  it('takes the list off again', () => {
    expect(setWholeTextList('• Eins\n• Zwei', null)).toBe('Eins\nZwei');
    expect(setWholeTextList('1. Eins\n2. Zwei', null)).toBe('Eins\nZwei');
    expect(setWholeTextList('- Eins\n- Zwei', null)).toBe('Eins\nZwei');
  });

  it('changes one kind of list into the other', () => {
    expect(setWholeTextList('• Eins\n• Zwei', 'ordered')).toBe('1. Eins\n2. Zwei');
    expect(setWholeTextList('1. Eins\n2. Zwei', 'bullet')).toBe('• Eins\n• Zwei');
  });

  it('brings the lines that are not yet items into a list that is in part', () => {
    expect(setWholeTextList('• Eins\nZwei', 'bullet')).toBe('• Eins\n• Zwei');
  });

  it('keeps the empty lines as they are and numbers each block anew', () => {
    expect(setWholeTextList('A\nB\n\nC\nD', 'ordered')).toBe('1. A\n2. B\n\n1. C\n2. D');
    expect(setWholeTextList('A\n\nB', 'bullet')).toBe('• A\n\n• B');
  });

  it('keeps the marks of the words', () => {
    expect(setWholeTextList('**Eins**\nZwei', 'bullet')).toBe('• **Eins**\n• Zwei');
    expect(setWholeTextList('• **Eins**\n• Zwei', null)).toBe('**Eins**\nZwei');
  });

  it('does not number one line: the stored text reads numbers as a list from two lines on', () => {
    expect(setWholeTextList('Eins', 'ordered')).toBe('Eins');
    expect(setWholeTextList('Eins', 'bullet')).toBe('• Eins');
  });

  it('leaves an empty text alone', () => {
    expect(setWholeTextList('', 'bullet')).toBe('');
  });
});

describe('wholeTextFormat: the list of the whole text', () => {
  it('names the bullet list and the numbered list', () => {
    expect(wholeTextFormat('• Eins\n• Zwei').bulletList).toBe(true);
    expect(wholeTextFormat('- Eins\n- Zwei').bulletList).toBe(true);
    expect(wholeTextFormat('1. Eins\n2. Zwei').orderedList).toBe(true);
    expect(wholeTextFormat('• Eins').bulletList).toBe(true);
  });

  it('is off where a line is not an item or the kinds are mixed', () => {
    const partly = wholeTextFormat('• Eins\nZwei');
    expect([partly.bulletList, partly.orderedList]).toEqual([false, false]);
    const mixed = wholeTextFormat('• Eins\n1. Zwei');
    expect([mixed.bulletList, mixed.orderedList]).toEqual([false, false]);
  });

  it('does not take one numbered line for a list: "1. Mai Demo" is a date', () => {
    expect(wholeTextFormat('1. Mai Demo').orderedList).toBe(false);
  });

  it('ignores the empty lines between the items', () => {
    expect(wholeTextFormat('• A\n\n• B').bulletList).toBe(true);
  });

  it('follows a list it has set', () => {
    const f = wholeTextFormat(setWholeTextList('Eins\nZwei', 'ordered'));
    expect(f.orderedList).toBe(true);
    expect(f.bulletList).toBe(false);
  });
});

describe('wholeTextCanOrderedList', () => {
  it('needs two lines with text', () => {
    expect(wholeTextCanOrderedList('Eins')).toBe(false);
    expect(wholeTextCanOrderedList('Eins\n')).toBe(false);
    expect(wholeTextCanOrderedList('Eins\nZwei')).toBe(true);
    expect(wholeTextCanOrderedList('Eins\n\nZwei')).toBe(true);
  });
});
