// SPDX-License-Identifier: MPL-2.0
import { afterEach, describe, expect, it } from 'vitest';

import { registerMessages } from '../i18n/messages.js';
import {
  canvasFormatGroupLabel,
  canvasFormatGroupOrder,
  registerCanvasFormatGroups,
  registerCanvasFormats,
  type CanvasFormat,
} from './index.js';

const story: CanvasFormat = {
  id: 'story-9-16',
  label: 'Story',
  description: '1080 × 1920 · 9:16',
  group: 'story',
  category: 'digital',
  width: 1080,
  height: 1920,
  dpi: 72,
  iconKey: 'portrait',
  defaultExport: 'png',
  exportable: ['png', 'jpeg'],
  print: null,
};

afterEach(() => {
  registerCanvasFormats([]);
  registerCanvasFormatGroups([]);
  registerMessages('de');
});

describe('format groups', () => {
  it('without host groups: today order and German labels', () => {
    expect(canvasFormatGroupOrder()).toEqual([
      'sharepic',
      'sharepic-tall',
      'profilbild',
      'praesentation',
    ]);
    expect(
      ['sharepic', 'sharepic-tall', 'profilbild', 'praesentation', 'print'].map(
        canvasFormatGroupLabel
      )
    ).toEqual(['Sharepics', 'Sharepics 3:4', 'Profilbild', 'Präsentationen', 'Print']);
  });

  it('a registered host group follows the built-ins and accepts formats', () => {
    registerCanvasFormatGroups([{ id: 'story', label: 'Stories' }]);
    registerCanvasFormats([story]);
    expect(canvasFormatGroupOrder()).toEqual([
      'sharepic',
      'sharepic-tall',
      'profilbild',
      'praesentation',
      'story',
    ]);
    expect(canvasFormatGroupLabel('story')).toBe('Stories');
  });

  it('built-in labels follow the active locale', () => {
    registerMessages('en');
    expect(canvasFormatGroupLabel('praesentation')).toBe('Presentations');
    expect(canvasFormatGroupLabel('profilbild')).toBe('Profile picture');
  });

  it('throws for a format with an unknown group, leaving formats unchanged', () => {
    expect(() => registerCanvasFormats([story])).toThrow(/story/);
  });

  it('throws when a group id collides with a built-in or repeats', () => {
    expect(() => registerCanvasFormatGroups([{ id: 'print', label: 'X' }])).toThrow(/print/);
    expect(() =>
      registerCanvasFormatGroups([
        { id: 'a', label: 'A' },
        { id: 'a', label: 'B' },
      ])
    ).toThrow(/'a'/);
    expect(canvasFormatGroupOrder()).toHaveLength(4);
  });

  it('rejects a replacement that orphans a registered format, keeping the groups', () => {
    registerCanvasFormatGroups([{ id: 'story', label: 'Stories' }]);
    registerCanvasFormats([story]);
    expect(() => registerCanvasFormatGroups([{ id: 'other', label: 'Other' }])).toThrow(
      /story-9-16.*story/
    );
    expect(() => registerCanvasFormatGroups([])).toThrow(/story-9-16/);
    expect(canvasFormatGroupLabel('story')).toBe('Stories');
    registerCanvasFormatGroups([
      { id: 'story', label: 'Geschichten' },
      { id: 'other', label: 'Other' },
    ]);
    expect(canvasFormatGroupLabel('story')).toBe('Geschichten');
  });
});
