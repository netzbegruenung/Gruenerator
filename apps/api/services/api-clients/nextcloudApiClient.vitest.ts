import { describe, expect, it } from 'vitest';

import { isWebdavSelfEntry } from './nextcloudApiClient.js';

const PREFIX = '/public.php/webdav';

describe('isWebdavSelfEntry', () => {
  it('recognises the listed folder in its own listing', () => {
    expect(isWebdavSelfEntry(`${PREFIX}/Stadtrat/`, `${PREFIX}/Stadtrat`)).toBe(true);
  });

  it('keeps a child that merely starts with the same name', () => {
    expect(isWebdavSelfEntry(`${PREFIX}/Stadtrat/Stadtrat/`, `${PREFIX}/Stadtrat`)).toBe(false);
  });

  it('keeps a real subfolder', () => {
    expect(isWebdavSelfEntry(`${PREFIX}/Stadtrat/2026/`, `${PREFIX}/Stadtrat`)).toBe(false);
  });

  it('matches through percent-encoding', () => {
    expect(
      isWebdavSelfEntry(`${PREFIX}/Antr%C3%A4ge%202026/`, `${PREFIX}/Antr%C3%A4ge%202026`)
    ).toBe(true);
  });

  it('matches a nested folder path', () => {
    expect(
      isWebdavSelfEntry(`${PREFIX}/Stadtrat/Antr%C3%A4ge/`, `${PREFIX}/Stadtrat/Antr%C3%A4ge`)
    ).toBe(true);
  });

  it('does not throw on a malformed escape and keeps the entry', () => {
    expect(isWebdavSelfEntry(`${PREFIX}/100%/`, `${PREFIX}/Stadtrat`)).toBe(false);
  });
});
