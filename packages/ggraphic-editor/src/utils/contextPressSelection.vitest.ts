// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { contextPressSelection } from '@ggraphic/editor/utils/deepSelect';

describe('contextPressSelection', () => {
  it('wählt das oberste Element, wenn nichts Ausgewähltes darunter liegt', () => {
    expect(contextPressSelection(['top', 'below'], ['other'])).toEqual(['top']);
  });

  it('lässt eine Mehrfachauswahl stehen, wenn eins ihrer Elemente getroffen ist', () => {
    expect(contextPressSelection(['b'], ['a', 'b'])).toBeNull();
  });

  it('lässt ein verdecktes, tief gewähltes Element ausgewählt', () => {
    expect(contextPressSelection(['cover', 'photo'], ['photo'])).toBeNull();
  });

  it('hebt die Auswahl auf leerer Fläche auf', () => {
    expect(contextPressSelection([], ['a'])).toEqual([]);
  });
});
