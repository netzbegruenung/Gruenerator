import { describe, expect, it } from 'vitest';

import { mdbOfficeContext } from './grueneMdBs.js';

describe('mdbOfficeContext', () => {
  it('adds Bundesland and function from the MdB list', () => {
    expect(mdbOfficeContext({ abgeordnete: 'Lisa Badum' })).toBe(
      'Büro von Lisa Badum, Bayern, Sprecherin für Klimapolitik'
    );
  });

  it('skips the Bundesland the role already names', () => {
    expect(mdbOfficeContext({ abgeordnete: 'Lisa Badum', bundesland: 'Bayern' })).toBe(
      'Büro von Lisa Badum, Sprecherin für Klimapolitik'
    );
  });

  it('keeps an unknown name on its own and returns null without one', () => {
    expect(mdbOfficeContext({ abgeordnete: 'Erika Musterfrau' })).toBe('Büro von Erika Musterfrau');
    expect(mdbOfficeContext({ abgeordnete: '  ' })).toBeNull();
    expect(mdbOfficeContext({})).toBeNull();
  });
});
